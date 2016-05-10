var hyperdrive = require('hyperdrive')
var sub = require('subleveldown')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var collect = require('collect-stream')
var semver = require('semver')

var INFO = 'i', DRIVE = 'd'

module.exports = DB
inherits(DB, EventEmitter)

function DB (db, opts) {
  var self = this
  if (!(self instanceof DB)) return new DB(db, opts)
  EventEmitter.call(self)
  self.db = sub(db, INFO)
  self.drive = hyperdrive(sub(db, DRIVE))
  self._pending = 1
  self.db.get('link', function (err, link) {
    if (err && notFound(err)) {
      self.emit('error', err)
    } else if (link) {
      self.archive = self.drive.createArchive(link)
      self.link = link
      if (--self._pending === 0) self.emit('_ready')
    } else {
      self.archive = self.drive.createArchive()
      self.archive.finalize(function () {
        self.link = self.archive.key.toString('hex')
        if (--self._pending === 0) self.emit('_ready')
      })
    }
  })
}

DB.prototype._ready = function (cb) {
  if (this._pending === 0) cb()
  else this.once('_ready', cb)
}

DB.prototype.versions = function (cb) {
  collect(this.drive.list(), function (err, entries) {
    if (err) cb(err)
    else cb(null, entries.filter(function (e) {
      return semver.valid(e.name)
    }))
  })
}

function notFound (err) {
  return /^notfound/i.test(err) || err.notFound
}
