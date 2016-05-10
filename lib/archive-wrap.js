var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var through = require('through2')

inherits(Wrap, EventEmitter)

function Wrap (prefix, archive) {
  if (!(this instanceof Wrap)) return new Wrap(prefix, archive)
  EventEmitter.call(tis)
  this._archive = archive
  this._prefix = prefix.replace(/\/+$/, '')
  this.key = archive.key + '/' + this._prefix
}

Wrap.prototype._fix = function (entry) {
  if (typeof entry === 'string') {
    entry = this._prefix + '/' + entry
  } else if (entry.name) {
    entry.name = this._prefix + '/' + entry.name
  }
  return entry
}

Wrap.prototype.append = function (entry, cb) {
  this._archive.append(this._fix(entry), cb)
}

Wrap.prototype.finalize = function (cb) {
  this._archive.finalize(cb)
}

Wrap.prototype.get = function (index, cb) {
  this._archive.get(index, cb)
}

Wrap.prototype.download = function (index, cb) {
  this._archive.download(index, cb)
}

Wrap.prototype.list = function () {
  var prefix = this._prefix
  this._archive.list().pipe(through.obj(write))

  function write (entry, enc, next) {
    if (entry.name.split('/')[0] === prefix) {
      this.push(fix(entry))
    }
    next()
  }
}

Wrap.prototype.createFileReadStream = function (entry) {
  return this._archive.createFileReadStream(this._fix(entry))
}

Wrap.prototype.createFileWriteStream = function (entry) {
  return this._archive.createFileWriteStream(this._fix(entry))
}
