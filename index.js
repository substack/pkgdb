var hprefix = require('hyperdrive-prefix')
var sub = require('subleveldown')
var mutexify = require('mutexify')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var concat = require('concat-stream')
var collect = require('collect-stream')
var semver = require('semver')
var once = require('once')

var INFO = 'i', DRIVE = 'd'

module.exports = Package
inherits(Package, EventEmitter)

function Package (opts) {
  if (!(this instanceof Package)) return new Package(opts)
  EventEmitter.call(this)
  this.db = opts.db
  this.drive = opts.drive
  this.log = opts.log
  this.link = null
  this.lock = mutexify()
}

Package.prototype._getArchive = function (version) {
  var self = this
  var cursor = hprefix(version)
  if (self.link) {
    process.nextTick(function () {
      cursor.setArchive(self.drive.createArchive(self.link, { live: true }))
    })
  } else self.lock(onlock)
  return cursor

  function onlock (release) {
    self.db.get('link', function (err, ilink) {
      if (err && !notFound(err)) {
        pkg.emit('error', err)
        return release()
      } else if (ilink) {
        self.link = Buffer(ilink, 'hex')
        cursor.setArchive(self.drive.createArchive(self.link, { live: true }))
        return release()
      }
      var archive = self.drive.createArchive(undefined, { live: true })
      var ws = archive.createFileWriteStream('versions.json')
      ws.once('finish', function () {
        self.link = archive.key
        self.db.put('link', self.link.toString('hex'), function (err) {
          if (err) return pkg.emit('error', err)
          var archive = self.drive.createArchive(self.link, { live: true })
          cursor.setArchive(archive)
          release()
        })
      })
      ws.end('[]\n')
    })
  }
}

Package.prototype.versions = function (cb) {
  cb = once(cb || noop)
  var archive = this._getArchive('x.x.x')
  var r = archive.createFileReadStream('../versions.json')
  r.on('error', cb)
  r.pipe(concat({ encoding: 'string' }, function (body) {
    try { var versions = JSON.parse(body) }
    catch (err) { return cb(err) }
    if (Array.isArray(versions)) cb(null, versions)
    else cb(new Error('unexpected non-array value for versions.json'))
  }))
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
    var wv = archive.createFileWriteStream('../versions.json')
    wv.once('error', cb)
    wv.once('finish', function () { cb(null) })

    self.versions(function (err, versions) {
      if (err) return cb(err)
      if (!versions) versions = []
      versions.push(version)
      wv.end(JSON.stringify(versions, null, 2) + '\n')
    })
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
