var hprefix = require('hyperdrive-prefix')
var hindex = require('hyperdrive-index')
var sub = require('subleveldown')
var mutexify = require('mutexify')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var concat = require('concat-stream')
var collect = require('collect-stream')
var semver = require('semver')
var once = require('once')

module.exports = Package
inherits(Package, EventEmitter)

function Package (opts) {
  if (!(this instanceof Package)) return new Package(opts)
  EventEmitter.call(this)
  this.db = opts.db
  this.drive = opts.drive
  this.log = opts.log
  this.lock = mutexify()
  this.archive = null
}

Package.prototype._getArchive = function (version) {
  var self = this
  var cursor = hprefix(version)
  if (self.archive) {
    process.nextTick(function () {
      cursor.setArchive(self.archive)
    })
  } else self.lock(onlock)
  return cursor

  function onlock (release) {
    self.db.get('link', function (err, ilink) {
      if (err && !notFound(err)) {
        pkg.emit('error', err)
        return release()
      } else if (ilink) {
        var link = Buffer(ilink, 'hex')
        self.archive = self.drive.createArchive(link, { live: true })
        cursor.setArchive(self.archive)
        return release()
      }
      self.archive = self.drive.createArchive({ live: true })
      var link = self.archive.key.toString('hex')
      self.db.put('link', link, function (err) {
        if (err) return pkg.emit('error', err)
        cursor.setArchive(self.archive)
        release()
      })
    })
  }
}

Package.prototype.versions = function (cb) {
  cb = once(cb || noop)
  collect(this.log.createReadStream(), function (err, docs) {
    if (err) cb(err)
    else cb(null, docs.filter(filter).map(map))
  })
  function filter (doc) {
    return doc.value && doc.value.type === 'publish'
  }
  function map (doc) { return doc.value.version }
}

Package.prototype.open = function (version) {
  var archive = this._getArchive(version)
  archive.createFileWriteStream = null
  return archive
}

Package.prototype.publish = function (version, cb) {
  var self = this
  cb = once(cb || noop)
  if (!semver.valid(version)) {
    return errTick(cb, 'invalid semver: ' + version)
  }
  var archive = self._getArchive(version)
  archive.commit = function () {
    self.log.append({
      type: 'publish',
      version: version,
      hash: '...'
    }, cb)
  }
  return archive
}

function noop () {}

function errTick (cb, msg) {
  var err = new Error(msg)
  process.nextTick(function () { cb(err) })
}
function notFound (err) {
  return err && (/^notfound/i.test(err) || err.notFound)
}
