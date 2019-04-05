#!/usr/bin/env node

/***********************
  Load Components!

  Express      - A Node.js Framework
  Body-Parser  - A tool to help use parse the data in a post request
  Pg-Promise   - A database tool to help use connect to our PostgreSQL database
***********************/
var express = require('express'); //Ensure our express framework has been added
var app = express();
var bodyParser = require('body-parser'); //Ensure our body-parser tool has been added
app.use(bodyParser.json());              // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

// load .env config file
const dotenv = require('dotenv');
dotenv.config();

//Create Database Connection
var pgp = require('pg-promise')();
var session = require('express-session');
var bcrypt = require('bcrypt');
var fs = require('fs');

// get db & its configuration
var dbConfig = JSON.parse(fs.readFileSync('db-config.json', 'utf8'));
var db = pgp(dbConfig);

// set the view engine to ejs
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/')); //This line is necessary for us to use relative paths and access our resources directory

// Create a session and initialize
// a not-so-secret secret key
app.use(session({
	'secret': 'whisper'
}));

// One way we could handle score upload logic
var PLACEMENTS_TO_POINTS = {
	1: 10,
	2: 5,
	3: 3,
	4: 2,
	5: 1	
}

function ensureLoggedIn(req, res) {
	// Check if the user is logged in or not
	if (req.session && req.session.userID) {	
		return true;
	} else {
        // If not, make them login
		res.redirect('/login');
		return false;
    }
}

app.get('/',function(req,res)
{
	var target_stmt =  "SELECT target_url FROM rounds ORDER BY id DESC limit 1;"

	db.oneOrNone(target_stmt)
	  .then(function(round){
		res.render('pages/home', {
			target_url: round ? round.target_url : null,
			my_title: "Home",
			loggedIn: false
		})
	})
	.catch(function(error) {
		console.log(error);
  	});	

});

app.get('/login', function(req, res)
{
	// Should present the user with a /login form
	res.render('pages/login_form', {
		my_title: 'Login',
		loggedIn: false
	});
});

app.post('/login', function(req, res)
{
	var body = req.body;

	// Validate the user's submitted login form by
	// (1) Checking if the hash of the submitted password 
	//   matches the one we have stored in our database,
	// SQLQ uery to get user_name and password_hash from users table
	var check_login =" SELECT id, password_hash FROM users WHERE user_name='"+ body.username+"';"
	db.oneOrNone(check_login)
		.then(function(result) {
			// (2) On success, redirect to the homepage
			if(result) {
				if(bcrypt.compareSync(body.password, result.password_hash)) {
				 // Passwords match
				 console.log(`User logged in: ${result.id}`);
				 req.session.userID = result.id;
				 res.redirect('/current_round'); 
				} else {
				 // (3) On different failures, return the user to the 
				 // login page and display a new error message explaining 
				 // what happened
				 // Passwords don't match
				 res.redirect('/login'); 
				}
			} else {
				// Username was not found
				res.redirect('/login');
			}
		})
		.catch(function(result) {
		    console.log(result);
	  	});	

});


app.get('/logout', function(req, res)
{
	req.session.userID = null;
	res.redirect('/');
});

app.get('/register', function(req, res)
{
	res.render('pages/registrationPage', {
		error: req.query.error,
		loggedIn: false
	});
});

app.post('/register', function(req, res)
{
	var body = req.body;
	var password_hash = bcrypt.hashSync(body.password, 10);
	var insert_user = 'INSERT INTO users (user_name, email, password_hash) ' +
	                      `VALUES ('${body.username}', '${body.email}', '${password_hash}') ` +
	                      'RETURNING id;' 
	db.oneOrNone(insert_user)
	  .then(function(result) {
	  	if(result) { 
      	  // Log the successfully registered user in; NOT working yet
      	  req.session.userID = result.id;
		  // If everything looks good, send the now-logged-in user to the home page
		  res.redirect('/current_round');
	  	}
	  })
	  .catch((result) => {
	  	console.log(result);
	    console.log(result.message);
	    if(result.message.startsWith('duplicate')) {
	    	var message = 'User already exists! Try again.';
	    	var urlEncodedMessage = encodeURIComponent(message);
	    	res.redirect(`/register?error=${urlEncodedMessage}`);
	    }
	  })
});

app.get('/playerProfile', function(req, res) {
	var loggedin = ensureLoggedIn(req, res);
	if(loggedin) {
		res.render('pages/playerProfilePage', {
			my_title: 'Player Profile',
			loggedIn: true
		});
	}
});

app.get('/upload', function(req, res) {
	var loggedin = ensureLoggedIn(req, res);
	if(loggedin) {
		res.render('pages/upload', {
			my_title: 'Upload',
			loggedIn: true
		});
	}
});

app.get('/current_round', function(req, res) {
	
	var loggedin = ensureLoggedIn(req, res);
	if(loggedin) {
		var target_url =  "SELECT target_url FROM rounds ORDER BY id DESC limit 1;"
		var user_name = 'SELECT user_name FROM users WHERE id=' + req.session.userID + ';';
		db.task('get-everything', task => {
	    	return task.batch([
	            task.oneOrNone(target_url),
	            task.one(user_name)
	        ]);
		})
		.then(results => {
	      let round = results[0];
	      let user = results[1];

	      res.render('pages/current_round',{
	      	my_title: "Current Round",
	        round: round ? round : null,
	        name: user,
	        loggedIn: true
	      })
		})
		.catch(function(error) {
		 	console.log(error);	  	
		});	
}	
});


app.get('/whereami', function(req, res) {
	res.render('pages/whereami', {
		my_title: 'Where Am I?',
		loggedIn: false,
		keys: {
			googlemaps: process.env.GOOGLE_MAPS_API_KEY,
			pn_sub: process.env.PN_SUB_KEY, 
			pn_pub: process.env.PN_PUB_KEY
		}
	});
});

app.listen(process.env.PORT);
console.log(`${process.env.PORT} is the magic port`);

