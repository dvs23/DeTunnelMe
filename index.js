"use strict";
var fs = require('fs');
var net = require('net');
var http = require('http');

var request = require('request');

var userData = require('./userData.js');

//i2c for connecting to the arduino responsible for sending the 433 MHz signal
var i2c = require('i2c');
var address = 0x04;
var wire = new i2c(address, {
    device: '/dev/i2c-1'
});

//if there is an internal alias for the given username, use it - otherwise return the given username
function procAlias(username) {
    if (Object.keys(userData.alias).indexOf(username) > -1)
        return userData.alias[username];

    return username;
}

//decrement every *SecsLeft variable greater than zero
//=> if we lock or wake someone, this variable is increased by the time to wait/lock in seconds
setInterval(function() {
    for (var userid of Object.keys(userData.tunnelUsers)) {
        if (userData.tunnelUsers[userid].lockedSecsLeft > 0)
            userData.tunnelUsers[userid].lockedSecsLeft -= 1;
        if (userData.tunnelUsers[userid].wakeLockSecsLeft > 0)
            userData.tunnelUsers[userid].wakeLockSecsLeft -= 1;
    }
}, 1000);

//passport init stuff start
var express = require('express');
var passport = require('passport');
var Strategy = require('passport-local').Strategy;

//tell passport to use a local username->password dict saved in userData.js
passport.use(new Strategy(
    function(locusername, locpassword, callb) {//basically it's a function to find a user in our db - if existing
        for (var i = 0; i < userData.users.length; i++) {//go through all users in our DB
            var user = userData.users[i];//save current user
            if (user.username === locusername) {//if it's the searched user
                return callb(null, user);//return the user together with the password
            }
        }
        return callb(null, null);//otherwise, if locusername hasn't been found, return null
    }));

passport.serializeUser(function(user, callb) {
    callb(null, user.id);
});

passport.deserializeUser(function(id, callb) {
    callb(null, userData.users[id]);
});

//passport init stuff end


// Create a new Express application.
var app = express();

app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({
    extended: true
}));
app.use(require('express-session')({
    secret: 'iuofoofressuszouxzrzru77r75 7c7',
    resave: false,
    saveUninitialized: false
}));

// Initialize Passport and restore authentication state, if any, from the session.
app.use(passport.initialize());
app.use(passport.session());

//handle commands by event
const EventEmitter = require('events');

class CommandEmitter extends EventEmitter {}

const comEmit = new CommandEmitter();

//express app.post/app.get emit an event to handle the wake/lock
comEmit.on("WAKE", (usr, wakeusr) => {
    if (Object.keys(userData.tunnelUsers).indexOf(usr) > -1 &&//if calling user
        Object.keys(userData.tunnelUsers).indexOf(wakeusr) > -1 &&// and the user to wake are in our DB
        userData.tunnelUsers[wakeusr].wakeLockSecsLeft === 0) {//and the calling user is not locked, so can wake someone
        //run the wake command
        userData.tunnelUsers[wakeusr].wakeLockSecsLeft = 10;//currently proceeding wake -> lock the calling user for the next 10 secs
        console.log('Sending wake to ' + usr);//log that we are waking somebody
        for (var i = 0; i < usr.length; i++) {//order our sending arduino to send the given username to wake it up
            wire.writeByte(usr.charCodeAt(i), function(err) {});
        }
        if (usr.length > 0)//if we have sent something
            wire.writeByte('%'.charCodeAt(0), function(err) {});//send our delimiter to tell the arduino that there's the end of the username
    }
});

comEmit.on("LOCK", (usr, time, lockusr) => {
    if (usr === lockusr) {//users can only lock themselves -> calling user and user to lock sould be equal
        console.log("LOCK: " + lockusr + " " + usr);//log that we are locking someone
        userData.tunnelUsers[usr].lockedSecsLeft = time * 60;//time is given to us in minutes, save it in seconds
    }
});

var btn =
    `<button type="button" class="btn {class}" id="{id}"{state}>
    {text}
</button>`;//template for a html/bootstrap button

//create the custom webpage for a specific user (wake/lock buttons, logout etc.)
function getBtns(username) {
    var formHTML = `<div>
                        <h2>Hallo, ` + username + `!</h2>`;//greet the user

    if (userData.tunnelUsers[username].lockedSecsLeft === 0) {//if the logged-in user is not already locked
        var lockMe = btn.replace("{class}", 'lock btn-secondary');
        lockMe = lockMe.replace("{state}", '');
        lockMe = lockMe.replace("{id}", username);
        lockMe = lockMe.replace("{text}", "Mich 30 Min. sperren");//add "lock me"-Button 
        formHTML += lockMe;
    } else//if the user is still locked, show how long
        formHTML += "<span>Du bist noch " + (userData.tunnelUsers[username].lockedSecsLeft / 60.0).toFixed(2) + " Min. gesperrt!</span>";

    formHTML += `<button type="button" class="btn logout btn-danger" id="` + username + `">
                    Ausloggen
                </button><br/>`;//log out button

    for (var userid of Object.keys(userData.tunnelUsers)) {//go through (other) users
        if (userid === username)//do not make buttons for waking yourself
            continue;

        if (userData.tunnelUsers[userid].lockedSecsLeft > 0) {//if the user is locked
            var tbtn = btn.replace("{class}", 'wake btn-danger');
            tbtn = tbtn.replace("{state}", ' disabled=""');
            tbtn = tbtn.replace("{id}", userid);
            tbtn = tbtn.replace("{text}", userData.tunnelUsers[userid].name + " ist gesperrt, " + (userData.tunnelUsers[userid].lockedSecsLeft / 60.0).toFixed(2) + " Min. verbleiben");
            formHTML += "<h3>" + userData.tunnelUsers[userid].name + "</h3>" + tbtn + "\n";//make a disabled button with the locking time left
        } else if (userData.tunnelUsers[username].wakeLockSecsLeft > 0) {//if the logged-in user is locked to wake anybody
            var tbtn = btn.replace("{class}", 'wake btn-danger');
            tbtn = tbtn.replace("{state}", ' disabled=""');
            tbtn = tbtn.replace("{id}", userid);
            tbtn = tbtn.replace("{text}", "Du kannst noch " + userData.tunnelUsers[username].wakeLockSecsLeft + " Sek. niemanden aufwecken");
            formHTML += "<h3>" + userData.tunnelUsers[userid].name + "</h3>" + tbtn + "\n";//disable buttons and show how long that user cannot wake anyone
        } else {//if the user is not locked and the logged-in user can wake someone
            var tbtn = btn.replace("{class}", 'wake btn-danger');
            tbtn = tbtn.replace("{state}", '');
            tbtn = tbtn.replace("{id}", userid);//add wake button
            tbtn = tbtn.replace("{text}", userData.tunnelUsers[userid].name + " aufwecken");
            formHTML += "<h3>" + userData.tunnelUsers[userid].name + "</h3>" + tbtn + "\n";
        }
    };
    formHTML += "</div>";//end container
    return formHTML;
}

function respondSlack(url, text){//send response over url from slack request -> avoid sending directly because of timeout
    request.post(//it's just a post request
        url, {//to the given URL
            json: {//containing a json with
                text: text,//the given answer to print in chat
                attachments: [{}]//propably unnecessary
            }
        },
        function(error, response, body) {//logging and error handling
            if (!error && response.statusCode == 200) {
                console.log("Success!");
                console.log(body);
            }
            else{
                console.log("Error with POST-request:");
                console.log(error);
            }
        }
    );
}

//express request handlers

app.get('/',//main page
    function(req, res) {
        if (req.user) {//if the request comes from a logged in user
            fs.readFile(__dirname + "/index.html", function(err, data, ending) {//load the template file
                var formHTML = getBtns(req.user.username);//generate custom content for the webpage

                var tresp = data.toString();//make string from read file data
                if (data.indexOf("{{content}}") > -1)//id there is {{content}} somewhere (that's where we put the custom content)
                    tresp = tresp.replace("{{content}}", formHTML);//and replace it with the generated stuff

                res.send(tresp);//send response
            });
        } else {//otherwise redirect to login 
            res.redirect('/login');
        }
    });

app.get('/getContent',//JSON get from main page -> self-refreshing without completely reloading the site
    function(req, res) {
        if (req.user) {//if the requester is logged in
            res.send(getBtns(req.user.username));//send him what he wants
        } else {//otherwise -> not logged in
            res.end();//send nothing
        }
    });

app.get('/login',//login page
    function(req, res) {//just send the login template from disk
        fs.readFile(__dirname + "/views/login.html", function(err, data, ending) {
            res.send(data.toString());
        });
    });

app.post('/login',//make passport handle login 
    passport.authenticate('local', {
        failureRedirect: '/login'
    }),
    function(req, res) {
        res.redirect('/');//after successful login, redirect to main page
    });

app.get('/logout',
    function(req, res) {
        req.logout();
        res.redirect('/');
    });

app.post('/wakeUp',//personal pages of each user can send a POST request to this path to wake someone up
    function(req, res) {
        if (req.user) {//check if a user is logged in (only those users have the permission to wake someone)
            if (typeof req.body.user !== 'undefined')//if the username to wake has been sent
                comEmit.emit("WAKE", req.body.user, req.user.username);//emit the event to wake that user
            res.redirect('/');//redirect back to main page after wake (I don't think this does anything, because we use preventDefault)
            return res.end();
        } else {
            res.redirect('/login');//if not logged in, redirect to login
        }
    });

app.post('/lock',//personal pages of each user can send a POST request to this path to lock theirselve
    function(req, res) {
        if (req.user) {//check if the user is logged in
            if (typeof req.body.user !== 'undefined' && typeof req.body.time !== 'undefined')//check if needed fields are defined
                comEmit.emit("LOCK", req.body.user, req.body.time, req.user.username);//emit lock event
            res.redirect('/');//and go back to main page
            return res.end();
        } else {//no user logged in
            res.redirect('/login');//redirect to login page
        }
    });

/*
Slack slash-commands send a post request to some predefined URL -> handled by slack.js
slack.js sends - after verifying the message - a post to this server, handled below
 */

app.post('/wakeUpSlack',//no authentification needed here -> posted by other NodeJS server
    function(req, res) {
        if (typeof req.body.user !== 'undefined' &&//check if all needed fields are defined
            typeof req.body.calluser !== 'undefined' && 
            typeof req.body.response_url !== 'undefined') {

            var user = procAlias(req.body.user);//save fields and translate to internal alias
            var calluser = procAlias(req.body.calluser);
            var response_url = req.body.response_url;

            if (Object.keys(userData.tunnelUsers).indexOf(user) > -1) {//both the calling user and the to-wake user should be in our DB
                if (Object.keys(userData.tunnelUsers).indexOf(calluser) > -1) {//if calling user is also in db
                    if (userData.tunnelUsers[user].lockedSecsLeft === 0) {//the user is not locked
                        if (userData.tunnelUsers[calluser].wakeLockSecsLeft === 0) {//and the calling user is not wake-locked
                            console.log(req.body);
                            comEmit.emit("WAKE", user, calluser);//wake/proceed request
                            respondSlack(response_url, "OK, " + user + " has been woken!");
                            res.send("OK, " + user + " has been woken!");
                        } else {//if user is wake-locked
                            respondSlack(response_url, "You ("+calluser+") are locked! " + userData.tunnelUsers[calluser].wakeLockSecsLeft + " sec. left.");
                            res.send("You ("+calluser+") are locked! " + userData.tunnelUsers[calluser].wakeLockSecsLeft + " sec. left.");
                        }
                    } else {//if to-wake user is locked
                        respondSlack(response_url, calluser+" is locked! " + (userData.tunnelUsers[calluser].lockedSecsLeft / 60.0).toFixed(2) + " min. left.");
                        res.send(calluser+" is locked! " + (userData.tunnelUsers[calluser].lockedSecsLeft / 60.0).toFixed(2) + " min. left.");
                    }
                } else {//if username of calling user has not been found
                    if (userData.tunnelUsers[user].lockedSecsLeft === 0) {//if to-wake user is not locked
                        console.log(req.body);
                        comEmit.emit("WAKE", user, user);//wake nevertheless, but respond with warning in slack
                        respondSlack(response_url, "OK, " + user + " has been woken! But you ("+calluser+") are no registered user...");
                        res.send("OK, " + user + " has been woken! But you ("+calluser+") are no registered user...");
                    } else {//if to-wake user is locked
                        respondSlack(response_url, "The user you want to wake is locked! " + (userData.tunnelUsers[calluser].lockedSecsLeft / 60.0).toFixed(2) + " min. left.  But you are no registered user...");
                        res.send("The user you want to wake is locked! " + (userData.tunnelUsers[calluser].lockedSecsLeft / 60.0).toFixed(2) + " min. left.  But you are no registered user...");
                    }
                }
            } else {//if to-wake user has not been found
                var respon = "Wrong username! Possible usernames:\n";//there's nothing we can do -> respond with list of valid usernames
                for (var userid of Object.keys(userData.tunnelUsers)) {
                    if (userData.tunnelUsers[userid].lockedSecsLeft > 0)
                        respon += userid + ", still locked for " + (userData.tunnelUsers[userid].lockedSecsLeft / 60.0).toFixed(2) + " min.\n";
                    else
                        respon += userid + "\n";
                }
                respondSlack(response_url, respon);
                res.send(respon);
            }

        } else{//if not all needed fields are defined
            res.send("Error!");
            console.log("Error! Malformed wake request...");
        }
    });

app.post('/lockSlack',
    function(req, res) {
        if (typeof req.body.lockuser !== 'undefined' &&//check if all needed fields are defined
            typeof req.body.response_url !== 'undefined') {

            var lockuser = procAlias(req.body.lockuser);//save fields and translate to internal alias
            var response_url = req.body.response_url;

            if (Object.keys(userData.tunnelUsers).indexOf(lockuser) > -1) {//if user to lock has been found

                if (userData.tunnelUsers[lockuser].lockedSecsLeft === 0) {//and user is not already locked
                    console.log(req.body);
                    comEmit.emit("LOCK", lockuser, req.body.time, lockuser);//lock user
                    respondSlack(response_url, "OK, you ("+lockuser+") have been locked for " + req.body.time + " min.!");
                    res.send("OK, you ("+lockuser+") have been locked for " + req.body.time + " min.!");
                } else {//if user is already locked
                    respondSlack(response_url, "You ("+lockuser+") are still locked! " + userData.tunnelUsers[lockuser].lockedSecsLeft + " Sec. left.");
                    res.send("You ("+lockuser+") are still locked! " + userData.tunnelUsers[lockuser].lockedSecsLeft + " Sec. left.");
                }
            } else {//if username to lock has not been found
                respondSlack(response_url, "Your username ("+lockuser+") is not registered at the DeTunnelMe-server.");
                res.send("Your username ("+lockuser+") is not registered at the DeTunnelMe-server.");
            }

        } else {//if not all needed fields are defined
            console.log("Error! Malformed lock request...");
            res.send("Error!");
        }
    });

var httpServer = http.createServer(app);

httpServer.listen(8080);


console.log('listening on http://localhost:8080');