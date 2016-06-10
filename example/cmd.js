#!/usr/bin/env node
var fs = require('fs')
var path = require('path')
var minimist = require('minimist')
var level = require('level')
var glob = require('glob')
var hyperdrive = require('hyperdrive')
var hyperlog = require('hyperlog')
var sub = require('subleveldown')
var pkgdb = require('../')

var argv = minimist(process.argv.slice(2))
var db = level('.pkgdb')

var pkg = pkgdb({
  drive: hyperdrive(sub(db, 'd')),
  log: hyperlog(sub(db, 'l'), { valueEncoding: 'json' }),
  db: sub(db, 'i')
})

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
    fs.createReadStream(m)
      .pipe(pub.createFileWriteStream(m))
      .once('finish', done)
  })
  g.once('end', done)

  function done () {
    if (--pending !== 0) return
    pub.commit(function (err, hash) {
      if (err) error(err)
      else console.log(version, hash)
    })
  }
} else if (argv._[0] === 'versions') {
  var version = argv._[1]
  pkg.versions(function (err, versions) {
    if (err) return error(err)
    versions.forEach(function (v) {
      console.log(v.version, v.hash)
    })
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
  console.error(err.toString())
  process.exit(1)
}
