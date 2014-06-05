var express = require('express');
var router = express.Router();
var mongo   = require('mongodb');
var Grid    = require('gridfs-stream');
var db      = new mongo.Db('projekt', new mongo.Server("localhost", 27017), {safe:true});
db.open(function(err, p_db) {
  db = p_db;
  db.createCollection('users', function(err) { });
});

/* GET home page. */
router.get('/', function(req, res) {
	if (req.session.user) {
		res.render('index', {userName: req.query.userName});
    } else {
        res.redirect('/login');
    }  
});

router.get('/login', function (req, res) {
	if (req.session.user) {
		var name = encodeURIComponent(userName);
		res.redirect('/?userName=' + name);
		return;
	}
	
	var message = '';
	if (req.query && req.query.message) {
		message = req.query.message;
	}
	
    res.render('login', {message: message});
});

router.post('/login', function (req, res) {
	req.session.regenerate(function () {
		var userName = req.body.userName;
		var password = req.body.password;
		db.collection('users').findOne({name: userName}, function(err, doc) {
			if (doc) {
				if (doc.password == password) {
					req.session.user = userName;
					var name = encodeURIComponent(userName);
					res.redirect('/?userName=' + name);
				}
				else {
					var message = encodeURIComponent('Złe hasło');
					res.redirect('/login?message=' + message);
				}
			}
			else {
			console.log('adding');
				db.collection('users').insert({name: userName, password: password}, function (err, doc) {
					if (err) {
						console.log(err);
						var message = encodeURIComponent('Wystąpił błąd, spróbuj jeszcze raz');
						res.redirect('/login?message=' + message);
						return;
					}
					
					req.session.user = userName;
					var name = encodeURIComponent(userName);
					res.redirect('/?userName=' + name);
				})
			}
		});
	});
});

router.get('/logout', function (req, res) {
	req.session.destroy(function () {
        res.redirect('/login');
    });
});

router.get(/^\/image\/(\w+)(?:\.\.(\w+))?$/, function(req, res) {
	if (!req.session.user) {
		res.redirect('/login');
		return;
	}
	
	var photoId = req.params[0];
	var gfs = Grid(db, mongo);
		var bufs = [];
		gfs.collection('photoscollection').findOne({_id: mongo.BSONPure.ObjectID(photoId)}, function(err, doc) {
			var readstream = gfs.createReadStream({
				_id: photoId,
				root: 'photoscollection'
			});
			readstream.on('error', function (err) {
			  console.log('An error occurred!', err);
			  res.render('error', {message: err});
			})
			.on('data', function (d) { bufs.push(d);})
			.on('end', function () {
				var fbuf = Buffer.concat(bufs);
				var imageContent = fbuf.toString('base64');
				console.log(doc.metadata.favouriteUsers.indexOf(req.session.user));
				res.render('image', {imageContent : imageContent, isFavourite: doc.metadata.favouriteUsers.indexOf(req.session.user) != -1, photoId: photoId});
			});
		});
});

router.post('/setFavourite', function(req, res) {
	if (!req.session.user) {
		res.send({});
		return;
	}

	var photoId = req.body.photoId;	
	var isFavourite = req.body.isFavourite ? JSON.parse(req.body.isFavourite) : false;
		var gfs = Grid(db, mongo);
		if (isFavourite) {
			gfs.collection('photoscollection')
				.update({_id: mongo.BSONPure.ObjectID(photoId)},
					{$addToSet: {'metadata.favouriteUsers': req.session.user}, $inc: {'metadata.userFavouritesNum': 1}},
					function (err, result) {
						res.end();
				   });
	    }
		else {
			gfs.collection('photoscollection')
				.update({_id: mongo.BSONPure.ObjectID(photoId)},
					{$pull: { 'metadata.favouriteUsers': req.session.user}, $inc: {'metadata.userFavouritesNum': -1}},
					function (err, result) {
						res.end();
				   });
		}
});

router.post('/getRanking', function(req, res) {
	if (!req.session.user) {
		res.send({});
		return;
	}

	var gfs = Grid(db, mongo);
	gfs.collection('photoscollection').find().sort({'metadata.userFavouritesNum':-1}).limit(3).toArray(function (err, files) {
				res.send({photos: files});
	});
});

/* POST to retrieve photos data*/
router.post('/photos', function(req, res) {
	if (!req.session.user) {
		res.send({});
		return;
	}
	
	var photoId = req.body.photoId;	
	var showMine = req.body.showMine ? JSON.parse(req.body.showMine) : false;
	var showFavourites = req.body.showFavourites ? JSON.parse(req.body.showFavourites) : false;
	
		var gfs = Grid(db, mongo);
		if (photoId) {
			var bufs = [];
			var readstream = gfs.createReadStream({
				_id: photoId,
				root: 'photoscollection'
			});
			readstream.on('error', function (err) {
			  console.log('An error occurred!', err);
			  res.render('error', {message: err});
			})
			.on('data', function (d) { bufs.push(d);})
			.on('end', function () {
				var fbuf = Buffer.concat(bufs);
				var imageContent = fbuf.toString('base64');
				if (req.body.showBig) {
					res.render('image', {imageContent : imageContent});
				}
				else {
					res.send(imageContent);
				}
			});
		}
		else {
			var filter = showFavourites ? { 'metadata.favouriteUsers': { $in: [req.session.user] }} : null;
			if(showMine) {
				filter = {'metadata.userName': req.session.user};
			}
			
			gfs.collection('photoscollection').find(filter).toArray(function (err, files) {
				res.send({photos: files});
			});
		}
});

router.post('/upload', function(req, res) {
	if (!req.session.user) {
		res.send({});
		return;
	}
	
	var fs = require('fs');
	console.log(req.files[0].userName);
		var gfs = Grid(db, mongo);
		var writestream = gfs.createWriteStream({
				filename: req.files[0].name,
				root: 'photoscollection',
				metadata: {
					userName: req.session.user,
					favourite: false,
					favouriteUsers : [],
					userFavouritesNum : 0
				}
			});
		writestream.on('close', function (file) {
			if (file == undefined) {
				res.send('error');
			}
			
			res.send({fileName: file.filename});
		});
		fs.createReadStream(req.files[0].path)
		.pipe(writestream);
});

module.exports = router;
