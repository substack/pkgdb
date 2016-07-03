var hprefix = require('hyperdrive-prefix')
var namedArchives = require('hyperdrive-named-archives')
var hlogdex = require('hyperlog-index')
var sub = require('subleveldown')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var concat = require('concat-stream')
var collect = require('collect-stream')
var semver = require('semver')
var once = require('once')

var VERDEX = 'v', NAMED = 'n'

module.exports = Package
inherits(Package, EventEmitter)

function Package (opts) {
  var self = this
  if (!(self instanceof Package)) return new Package(opts)
  EventEmitter.call(self)
  self.db = opts.db
  self.drive = opts.drive
  self.log = opts.log

  var named = namedArchives({
    drive: self.drive,
    db: sub(self.db, NAMED)
  })
  self.archive = named.createArchive('versions')

  self._verdb = sub(self.db, VERDEX, { valueEncoding: 'json' })
  self._verdex = hlogdex({
    db: self.db,
    log: self.log,
    map: function (row, next) {
      var v = row.value
      if (!v || v.type !== 'publish') return next()
      self._verdb.get(v.version, function (err, values) {
        values = (values || []).concat(v.hash)
        self._verdb.put(v.version, values, next)
      })
    }
  })
  self._verdex.on('error', self.emit.bind(self, 'error'))
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
  function map (doc) {
    return {
      version: doc.value.version,
      hash: doc.value.hash,
      block: doc.value.block
    }
  }
}

Package.prototype.open = function (version) {
  var self = this
  var archive = hprefix(version)
  if (/^[0-9a-f]{8,}$/.test(version)) {
    archive.setArchive(self.archive.checkout(version))
    return archive
  }
  self._verdb.get(version, function (err, hashes) {
    if (err) return archive.emit('error', err)
    archive.setArchive(self.archive.checkout(hashes[0]))
  })
  return archive
}

Package.prototype.publish = function (version) {
  var self = this
  if (!semver.valid(version)) {
    throw new Error('invalid semver: ' + version)
  }
  var archive = hprefix(version)
  archive.setArchive(self.archive)
  archive.commit = function (cb) {
    cb = once(cb || noop)
    self._availableVersion(version, function (err, ok) {
      if (err) cb(err)
      else if (!ok) cb(new Error('version already in use'))
      else commit(cb)
    })
  }
  function commit (cb) {
    self.archive.metadata.head(function (err, hash, block) {
      self.log.append({
        type: 'publish',
        version: version,
        hash: hash.toString('hex'),
        block: block
      }, onappend)
      function onappend (err) {
        if (err) cb(err)
        else cb(null, hash.toString('hex'))
      }
    })
  }
  return archive
}

Package.prototype._availableVersion = function (version, cb) {
  var self = this
  self._verdex.ready(function () {
    self._verdb.get(version, function (err, versions) {
      if (err && !notFound(err)) cb(err)
      else if (versions && versions.length > 0) cb(null, false)
      else cb(null, true)
    })
  })
}

function noop () {}

function errTick (cb, msg) {
  var err = new Error(msg)
  process.nextTick(function () { cb(err) })
}
function notFound (err) {
  return err && (/^notfound/i.test(err) || err.notFound)
}
