# How to setup a (new) client

## Programming the Arduino

First, open the `DeTunnelMe_Client.ino` sketch from the DeTunnelMe-directory.

In line 3, there is something like 

`#define USERNAME "mrx"`

Insert your name here (should be really short). 

After that, upload the sketch to your Arduino as described in 

[How to program an Arduino](./How-to-program-an-Arduino.md)

## Adding a server user

After that, you need to register the name you burnt to your Arduino in the server. For this purpose, open userData.js (or copy userData.js.template to userData.js if you don't have one, yet) and do the following:

- Add an entry to tunnelUsers:

```javascript
var tunnelUsers = {
    "mrx": {//this is the important name used for login and /wake
        name: "Mr. X",//this is just the name displayed in the webgui
        lockedSecsLeft: 0,
        wakeLockSecsLeft: 0
    },...
};
```

- Add an entry to users:

```javascript
var users = [
...,
{
    id: 3,//remember to use an unique number here
    username: "mrx",//same name as above
    password: "1234"//well, the password could be stronger ;)
}];
```

- If **necessary**, add an entry to alias:

```javascript
var alias = {
    "john.doe": "mrx",//first one is your Slack-username, second one your system name like above
    ...
};
```

So - when is this necessary? It's always necessary when your Slack-username differs from the name you use in the DeTunnelMe-system. Sometimes the Slack-username is too long or you simply want a shorter/cooler name ;)

How to find out your Slack-username? Well, that's not as easy as it should be. The method I used is the following: 

1. With a up-and-running server environment with registered slack-commands, use `/wake somenonexistingname`
2. Then, ssh into your pi and run `sudo systemctl status detunnelme_slack`

  A log should appear similar to this one:

```
[some date log stuff] user_id: 'someuserid',
[some date log stuff] user_name: 'yourUserName',
[some date log stuff] command: '/wake',
[some date log stuff] text: 'bla',
[some date log stuff] response_url: 'https://hooks.slack.com/commands/...
```

The `user_name` field contains your Slack-username :)

So, in this case you should add the following line to your alias-map:

`"yourUserName": "mrx",`

After that, restart the main and the Slack-server:

`sudo systemctl restart detunnelme_slack detunnelme`

After that, you should be "wake-able" ;)