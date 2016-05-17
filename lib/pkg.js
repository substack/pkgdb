var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var concat = require('concat-stream')
var semver = require('semver')
var once = require('once')

module.exports = Package
inherits(Package, EventEmitter)

function Package (getArchive) {
  if (!(this instanceof Package)) return new Package(getArchive)
  EventEmitter.call(this)
  this._getArchive = getArchive
}

Package.prototype.versions = function (cb) {
  cb = once(cb || noop)
  var archive = this._getArchive()
  var r = archive.createFileReadStream('versions.json')
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
  var archive = this._getArchive(version)
  var wv = archive.createFileWriteStream('versions.json')
  this.versions(function (err, versions) {
    if (err) return cb(err)
    versions.push(version)
    wv.end(JSON.stringify(versions, null, 2) + '\n')
  })
  return archive
}

function notFound (err) { return /^notfound/i.test(err) || err.notFound }
function noop () {}

function errTick (cb, msg) {
  var err = new Error(msg)
  process.nextTick(function () { cb(err) })
}
