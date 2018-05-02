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
                        <h2>Hallo, ` + username + `!</h2>`;

    if (userData.tunnelUsers[username].lockedSecsLeft === 0) {
        var lockMe = btn.replace("{class}", 'lock btn-secondary');
        lockMe = lockMe.replace("{state}", '');
        lockMe = lockMe.replace("{id}", username);
        lockMe = lockMe.replace("{text}", "Mich 30 Min. sperren");
        formHTML += lockMe;
    } else
        formHTML += "<span>Du bist noch " + (userData.tunnelUsers[username].lockedSecsLeft / 60.0).toFixed(2) + " Min. gesperrt!</span>";

    formHTML += `<button type="button" class="btn logout btn-danger" id="` + username + `">
                    Ausloggen
                </button><br/>`;

    for (var userid of Object.keys(userData.tunnelUsers)) {
        if (userid === username)
            continue;

        if (userData.tunnelUsers[userid].lockedSecsLeft > 0) {
            var tbtn = btn.replace("{class}", 'wake btn-danger');
            tbtn = tbtn.replace("{state}", ' disabled=""');
            tbtn = tbtn.replace("{id}", userid);
            tbtn = tbtn.replace("{text}", userData.tunnelUsers[userid].name + " ist gesperrt, " + (userData.tunnelUsers[userid].lockedSecsLeft / 60.0).toFixed(2) + " Min. verbleiben");
            formHTML += "<h3>" + userData.tunnelUsers[userid].name + "</h3>" + tbtn + "\n";
        } else if (userData.tunnelUsers[username].wakeLockSecsLeft > 0) {
            var tbtn = btn.replace("{class}", 'wake btn-danger');
            tbtn = tbtn.replace("{state}", ' disabled=""');
            tbtn = tbtn.replace("{id}", userid);
            tbtn = tbtn.replace("{text}", "Du kannst noch " + userData.tunnelUsers[username].wakeLockSecsLeft + " Sek. niemanden aufwecken");
            formHTML += "<h3>" + userData.tunnelUsers[userid].name + "</h3>" + tbtn + "\n";
        } else {
            var tbtn = btn.replace("{class}", 'wake btn-danger');
            tbtn = tbtn.replace("{state}", '');
            tbtn = tbtn.replace("{id}", userid);
            tbtn = tbtn.replace("{text}", userData.tunnelUsers[userid].name + " aufwecken");
            formHTML += "<h3>" + userData.tunnelUsers[userid].name + "</h3>" + tbtn + "\n";
        }
    };
    formHTML += "</div>";
    return formHTML;
}

function respondSlack(url, text){
    request.post(
        url, {
            json: {
                text: text,
                attachments: [{}]
            }
        },
        function(error, response, body) {
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

app.get('/',
    function(req, res) {
        if (req.user) {
            fs.readFile(__dirname + "/index.html", function(err, data, ending) {
                var formHTML = getBtns(req.user.username);

                var tresp = data.toString();
                if (data.indexOf("{{content}}") > -1)
                    tresp = tresp.replace("{{content}}", formHTML);

                res.send(tresp);
            });
        } else {
            res.redirect('/login');
        }
    });

app.get('/getContent',
    function(req, res) {
        if (req.user) {
            res.send(getBtns(req.user.username));
        } else {
            res.end();
        }
    });

app.get('/login',
    function(req, res) {
        fs.readFile(__dirname + "/views/login.html", function(err, data, ending) {
            res.send(data.toString());
        });
    });

app.post('/login',
    passport.authenticate('local', {
        failureRedirect: '/login'
    }),
    function(req, res) {
        res.redirect('/');
    });

app.post('/wakeUp',
    function(req, res) {
        if (req.user) {
            if (typeof req.body.user !== 'undefined')
                comEmit.emit("WAKE", req.body.user, req.user.username);
            res.redirect('/');
            return res.end();
        } else {
            res.redirect('/login');
        }
    });

app.post('/lock',
    function(req, res) {
        if (req.user) {
            if (typeof req.body.user !== 'undefined' && typeof req.body.time !== 'undefined')
                comEmit.emit("LOCK", req.body.user, req.body.time, req.user.username);
            res.redirect('/');
            return res.end();
        } else {
            res.redirect('/login');
        }
    });

app.post('/wakeUpSlack',
    function(req, res) {
        if (typeof req.body.user !== 'undefined' &&
            typeof req.body.calluser !== 'undefined' && 
            typeof req.body.response_url !== 'undefined') {

            var user = procAlias(req.body.user);
            var calluser = procAlias(req.body.calluser);
            var response_url = req.body.response_url;

            if (Object.keys(userData.tunnelUsers).indexOf(user) > -1) {
                if (Object.keys(userData.tunnelUsers).indexOf(calluser) > -1) {
                    if (userData.tunnelUsers[user].lockedSecsLeft === 0) {
                        if (userData.tunnelUsers[calluser].wakeLockSecsLeft === 0) {
                            console.log(req.body);
                            comEmit.emit("WAKE", user, calluser);
                            respondSlack(response_url, "OK, " + user + " has been waked!");
                            res.send("OK, " + user + " has been waked!");
                        } else {
                            respondSlack(response_url, "You ("+calluser+") are locked! " + userData.tunnelUsers[calluser].wakeLockSecsLeft + " sec. left.");
                            res.send("You ("+calluser+") are locked! " + userData.tunnelUsers[calluser].wakeLockSecsLeft + " sec. left.");
                        }
                    } else {
                        respondSlack(response_url, calluser+" is locked! " + (userData.tunnelUsers[calluser].lockedSecsLeft / 60.0).toFixed(2) + " min. left.");
                        res.send(calluser+" is locked! " + (userData.tunnelUsers[calluser].lockedSecsLeft / 60.0).toFixed(2) + " min. left.");
                    }
                } else {
                    if (userData.tunnelUsers[user].lockedSecsLeft === 0) {
                        console.log(req.body);
                        comEmit.emit("WAKE", user, user);
                        respondSlack(response_url, "OK, " + user + " has been waked! But you ("+calluser+") are no registered user...");
                        res.send("OK, " + user + " has been waked! But you ("+calluser+") are no registered user...");
                    } else {
                        respondSlack(response_url, "The user you want to wake is locked! " + (userData.tunnelUsers[calluser].lockedSecsLeft / 60.0).toFixed(2) + " min. left.  But you are no registered user...");
                        res.send("The user you want to wake is locked! " + (userData.tunnelUsers[calluser].lockedSecsLeft / 60.0).toFixed(2) + " min. left.  But you are no registered user...");
                    }
                }
            } else {
                var respon = "Wrong username! Possible usernames:\n";
                for (var userid of Object.keys(userData.tunnelUsers)) {
                    if (userData.tunnelUsers[userid].lockedSecsLeft > 0)
                        respon += userid + ", still locked for " + (userData.tunnelUsers[userid].lockedSecsLeft / 60.0).toFixed(2) + " min.\n";
                    else
                        respon += userid + "\n";
                }
                respondSlack(response_url, respon);
                res.send(respon);
            }

        } else{
            res.send("Error!");
            console.log("Error! Malformed wake request...");
        }
    });

app.post('/lockSlack',
    function(req, res) {
        if (typeof req.body.lockuser !== 'undefined' &&
            typeof req.body.response_url !== 'undefined') {

            var lockuser = procAlias(req.body.lockuser);
            var response_url = req.body.response_url;

            if (Object.keys(userData.tunnelUsers).indexOf(lockuser) > -1) {

                if (userData.tunnelUsers[lockuser].lockedSecsLeft === 0) {
                    console.log(req.body);
                    comEmit.emit("LOCK", lockuser, req.body.time, lockuser);
                    respondSlack(response_url, "OK, you ("+lockuser+") have been locked for " + req.body.time + " min.!");
                    res.send("OK, you ("+lockuser+") have been locked for " + req.body.time + " min.!");
                } else {
                    respondSlack(response_url, "You ("+lockuser+") are still locked! " + userData.tunnelUsers[lockuser].lockedSecsLeft + " Sec. left.");
                    res.send("You ("+lockuser+") are still locked! " + userData.tunnelUsers[lockuser].lockedSecsLeft + " Sec. left.");
                }
            } else {
                respondSlack(response_url, "Your username ("+lockuser+") is not registered at the DeTunnelMe-server.");
                res.send("Your username ("+lockuser+") is not registered at the DeTunnelMe-server.");
            }

        } else{
            console.log("Error! Malformed lock request...");
            res.send("Error!");
        }
    });


app.get('/logout',
    function(req, res) {
        req.logout();
        res.redirect('/');
    });

var httpServer = http.createServer(app);

httpServer.listen(8080);


console.log('listening on http://localhost:8080');