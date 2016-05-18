var hyperdrive = require('hyperdrive')
var hprefix = require('hyperdrive-prefix')
var collect = require('collect-stream')
var once = require('once')
var through = require('through2')
var readonly = require('read-only-stream')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var sub = require('subleveldown')
var mutexify = require('mutexify')
var has = require('has')
var Package = require('./lib/pkg.js')

var INFO = 'i', DRIVE = 'd'

module.exports = DB
inherits(DB, EventEmitter)

function DB (db, opts) {
  if (!(this instanceof DB)) return new DB(db, opts)
  EventEmitter.call(this)
  this.db = sub(db, INFO)
  this.drive = hyperdrive(sub(db, DRIVE))
  this._links = {}
  this._locks = {}
}

DB.prototype._getArchive = function (name, fn) {
  var self = this
  if (has(self._links, name)) {
    return process.nextTick(function () {
      fn(self.drive.createArchive(self._links[name], { live: true }))
    })
  }
  if (!has(self._locks, name)) {
    self._locks[name] = mutexify()
  }
  self._locks[name](function (release) {
    self.db.get('link!' + name, function (err, link) {
      if (err && !notFound(err)) {
        self.emit('error', err)
        release()
      } else if (link) {
        link = Buffer(link, 'hex')
        fn(self.drive.createArchive(link, { live: true }))
        self._links[name] = link
        release()
      } else {
        var archive = self.drive.createArchive(undefined, { live: true })
        var ws = archive.createFileWriteStream('versions.json')
        ws.end('[]\n')
        link = archive.key.toString('hex')
        self._links[name] = archive.key
        self.db.put('link!' + name, link, function (err) {
          if (err) return self.emit('error', err)
          fn(self.drive.createArchive(archive.key, { live: true }))
          release()
        })
      }
    })
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
    self._getArchive(name, function (archive) {
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
