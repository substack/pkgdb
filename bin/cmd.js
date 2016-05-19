#!/usr/bin/env node
var fs = require('fs')
var path = require('path')
var minimist = require('minimist')
var defined = require('defined')
var level = require('level')
var glob = require('glob')
var pkgdb = require('../')

var argv = minimist(process.argv.slice(2))
var dir = process.cwd()
var name = defined(argv.name, path.basename(dir))
var db = level('.pkgdb', { valueEncoding: 'binary' })
var pkg = pkgdb(db).open(name)

if (argv._[0] === 'publish') {
  var version = argv._[1]
  var pub = pkg.publish(version)
  var g = glob('**', {
    ignore: [ '.pkgdb/**', '.git/**', 'node_modules/**' ],
    nodir: true
  })
  var pending = 1
  g.on('match', function (m) {
    pending++
    fs.createReadStream(path.join(dir, m))
      .pipe(pub.createFileWriteStream(m))
      .once('finish', done)
  })
  g.once('end', done)

  function done () { if (--pending === 0) pub.commit() }
} else if (argv._[0] === 'versions') {
  var version = argv._[1]
  pkg.versions(function (err, versions) {
    if (err) return error(err)
    versions.forEach(function (v) { console.log(v) })
  })
} else if (argv._[0] === 'files') {
  var version = argv._[1]
  pkg.open(version).list(function (err, files) {
    if (err) return error(err)
    files.forEach(function (entry) { console.log(entry.name) })
  })
} else if (argv._[0] === 'read') {
  var version = argv._[1]
  var file = argv._[2]
  pkg.open(version).createFileReadStream(file)
    .pipe(process.stdout)
}

function error (err) {
  console.error(err)
  process.exit(1)
}
