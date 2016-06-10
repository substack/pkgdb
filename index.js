var hprefix = require('hyperdrive-prefix')
var hlogdex = require('hyperlog-index')
var sub = require('subleveldown')
var mutexify = require('mutexify')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var concat = require('concat-stream')
var collect = require('collect-stream')
var semver = require('semver')
var once = require('once')

var VERDEX = 'v'

module.exports = Package
inherits(Package, EventEmitter)

function Package (opts) {
  var self = this
  if (!(self instanceof Package)) return new Package(opts)
  EventEmitter.call(self)
  self.db = opts.db
  self.drive = opts.drive
  self.log = opts.log
  self.lock = mutexify()
  self.archive = null

  self._verdb = sub(self.db, VERDEX, { valueEncoding: 'json' })
  self._verdex = hlogdex({
    db: self.db,
    log: self.log,
    map: function (row, next) {
      var k = row.key, v = row.value
      if (!v || v.type !== 'publish') return next()
      self._verdb.get(v.version, function (err, values) {
        if (err && !notFound(err)) return next(err)
        values = (values || []).concat(k)
        self._verdb.put(v.version, values, next)
      })
    }
  })
  self._verdex.on('error', self.emit.bind(self, 'error'))
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
  function map (doc) {
    return {
      version: doc.value.version,
      hash: doc.value.hash,
      block: doc.value.block
    }
  }
}

Package.prototype.open = function (version) {
  var archive = this._getArchive(version)
  archive.createFileWriteStream = null
  return archive
}

Package.prototype.publish = function (version) {
  var self = this
  if (!semver.valid(version)) {
    throw new Error('invalid semver: ' + version)
  }
  var archive = self._getArchive(version)
  archive.commit = function (cb) {
    cb = once(cb || noop)
    self._availableVersion(version, function (err, ok) {
      if (err) cb(err)
      else if (!ok) cb(new Error('version already in use'))
      else commit(cb)
    })
  }
  function commit (cb) {
    archive._archive.metadata.head(function (err, hash, block) {
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
