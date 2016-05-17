var hyperdrive = require('hyperdrive')
var hprefix = require('hyperdrive-prefix')
var collect = require('collect-stream')
var once = require('once')
var through = require('through2')
var readonly = require('read-only-stream')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
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
    if (err && notFound(err)) {
      self.emit('error', err)
    } else if (link) {
      fn(self.drive.createArchive(link))
    } else {
      self.archive = self.drive.createArchive()
      var wv = self.archive.createWriteStream('versions.json')
      ws.end('[]\n')
      self.archive.finalize(function () {
        self.db.put('link', link, function (err) {
          if (err) return self.emit('error', err)
          self.link = self.archive.key.toString('hex')
          if (--self._pending === 0) self.emit('_ready')
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
    var cursor = hprefix(version === undefined ? name : name + '/' + version)
    var finalize = []
    cursor.finalize = function (fn) { finalize.push(fn) }
    self._getArchive(name, function (archive) {
      finalize.forEach(function (fn) { archive.finalize(fn) })
      finalize = null
      cursor.finalize = function (fn) { archive.finalize(fn) }
      cursor.setArchive(archive)
    })
    return cursor
  })
}

function notFound (err) { return /^notfound/i.test(err) || err.notFound }
function noop () {}
