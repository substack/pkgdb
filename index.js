var hyperdrive = require('hyperdrive')
var hprefix = require('hyperdrive-prefix')
var collect = require('collect-stream')
var once = require('once')
var through = require('through2')
var readonly = require('read-only-stream')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var sub = require('subleveldown')
var Package = require('./lib/pkg.js')

var INFO = 'i', DRIVE = 'd'

module.exports = DB
inherits(DB, EventEmitter)

function DB (db, opts) {
  if (!(this instanceof DB)) return new DB(db, opts)
  EventEmitter.call(this)
  this.db = sub(db, INFO)
  this.drive = hyperdrive(sub(db, DRIVE))
}

DB.prototype._getArchive = function (name, fn) {
  var self = this
  self.db.get('link!' + name, function (err, link) {
    if (err && !notFound(err)) {
      self.emit('error', err)
    } else if (link) {
      fn(self.drive.createArchive(link))
    } else {
      var archive = self.drive.createArchive()
      var ws = archive.createFileWriteStream('versions.json')
      ws.end('[]\n')
      archive.finalize(function () {
        link = archive.key.toString('hex')
        self.db.put('link!' + name, link, function (err) {
          if (err) return self.emit('error', err)
          fn(self.drive.createArchive(link))
        })
      })
    }
  })
}

DB.prototype.list = function (cb) {
  var self = this
  var r = self.db.createReadStream({ gt: 'link!', lt: 'link!\uffff' })
  var stream = through.obj(write)
  r.once('error', stream.emit.bind(stream, 'error'))
  if (cb) collect(stream, cb)
  return readonly(r.pipe(stream))

  function write (row, enc, next) {
    next(null, { name: row.value })
  }
}

DB.prototype.open = function (name) {
  var self = this
  return new Package(function (version) {
    var parent = hprefix(name)
    var cursor = hprefix(name + '/' + version)
    var finalize = []
    cursor.finalize = function (fn) { finalize.push(fn) }
    self._getArchive(name, function (archive) {
      finalize.forEach(function (fn) { archive.finalize(fn) })
      finalize = null
      cursor.finalize = function (fn) { archive.finalize(fn) }
      cursor.setArchive(archive)
      parent.setArchive(archive)
    })
    return { parent: parent, version: cursor }
  })
}

function notFound (err) {
  return err && (/^notfound/i.test(err) || err.notFound)
}
function noop () {}
