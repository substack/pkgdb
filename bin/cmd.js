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
var db = level('.pkgdb')
var pkg = pkgdb(db).open(name)

if (argv._[0] === 'publish') {
  var version = argv._[1]
  var pub = pkg.publish(version)
  var g = glob('**')
  g.once('match', function (m) {
    fs.createReadStream(path.join(dir, m))
      .pipe(pub.createFileWriteStream(m))
  })
  g.once('end', function () {
    pub.finalize()
  })
} else if (argv._[0] === 'versions') {
  var version = argv._[1]
  pkg.versions(function (err, versions) {
    if (err) return error(err)
    versions.forEach(function (v) { console.log(v) })
  })
}

function error (err) {
  console.error(err)
  process.exit(1)
}
