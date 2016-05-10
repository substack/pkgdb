var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var concat = require('concat-stream')
var semver = require('semver')
var once = require('once')
var ArchiveWrap = require('./archive-wrap.js')

module.exports = Package
inherits(Package, EventEmitter)

function Package (db, archive) {
  var self = this
  if (!(self instanceof Package)) return new Package(db, archive)
  EventEmitter.call(self)
  self.db = db
  self.archive = archive
}

Package.prototype.versions = function (cb) {
  cb = once(cb || noop)
  var r = this.archive.createFileReadStream('versions.json')
  r.on('error', cb)
  r.pipe(concat({ encoding: 'string' }, function (body) {
    try { var versions = JSON.parse(body) }
    catch (err) { return cb(err) }
    if (Array.isArray(versions)) cb(null, versions)
    else cb(new Error('unexpected non-array value for versions.json'))
  }))
}

Package.prototype.publish = function (version, cb) {
  cb = once(cb || noop)
  if (!semver.valid(version)) {
    return errTick(cb, 'invalid semver: ' + version)
  }
  var wv = this.createFileWriteStream('versions.json')
  this.versions(function (err, versions) {
    if (err) return cb(err)
    versions.push(version)
    wv.end(JSON.stringify(versions, null, 2) + '\n')
  })
  return new ArchiveWrap(version, this.archive)
}

function notFound (err) { return /^notfound/i.test(err) || err.notFound }
function noop () {}

function errTick (cb, msg) {
  var err = new Error(msg)
  process.nextTick(function () { cb(err) })
}
