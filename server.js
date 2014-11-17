var express = require('express');
var WebSocketServer = require('ws').Server;
var socketIds = 0;
var streamData = {
  tweetsByTicker: require('./tweets').data,
  tickerUpdates: require('./ticker-updates').data,
  newsForTicker: require('./ticker-news').data
};

app = express();
app.use(express.static(__dirname + '/public'));
app.listen(8000);

var wss = new WebSocketServer({
  port: 8001
});

console.log('http on port 8000\nwebsocket on port 8001');

var subManager = {
  sub: function (ws, intent) {
      console.log('in ----> ' + ws.id);
    this._subscriptions = this._subscriptions || {};
    this._subscriptions[ws.id] = this._subscriptions[ws.id] || {};
    this._subscriptions[ws.id][intent.model] = this._subscriptions[ws.id][intent.model] || {};
    var timerId = this._subscriptions[ws.id][intent.model][intent.query] = setInterval(function() {
      try {
        ws.send('newdata:'+intent.model+':'+intent.query+':'+getRandomData(intent.model))
      }
      catch(e) {
        console.error('whatever, clearInterval');
        clearInterval(timerId);
      }
    }, (Math.random() * 300) + 100);
  },

  unsub: function (ws, intent) {
    try {
      console.log('out <--- ' + ws.id);
      var sub = this._subscriptions[ws.id] && this._subscriptions[ws.id][intent.model] && this._subscriptions[ws.id][intent.model][intent.query];
      if(sub) {
        clearInterval(sub);
      }
    }
    catch (e) {
      console.error('Could not clear subscription', e);
    }
  },
  
  cleanUpSocket: function (ws) {
    for (var model in this._subscriptions[ws.id]) {
      for (var query in this._subscriptions[ws.id][model]) {
        this.unsub(ws, {model: model, query: query});
      }
    }
  }
};

wss.on('connection', function(ws) {
  ws.id = getUniqueId();
  ws.send('thx for connecting. u shld subscribe to one of my streams of data' +
    'Such as, tweetsByTicker, newsForTicker, tickerUpdates\n' +
    'Subscribe by: ws.send("sub:tickerUpdates:goog")');
  ws.on('message', function(msg) {
    var intent = parseMsg(msg);
    if (intent) {
      subManager[intent.action](ws, intent);
    }
    else {
      console.log('msg received: ', msg);
      ws.send('thx for ur msg');
    }
  });

  ws.on('close', function() {
    subManager.cleanUpSocket(ws);
  });

  function parseMsg(msg) {
    var parsed = /(sub|unsub):([a-zA-Z]*):([a-zA-Z]*)/.exec(msg);
    return parsed && parsed.length === 4 ? {
      action: parsed[1],
      model: parsed[2],
      query: parsed[3]
    } : undefined;
  }
});

function getRandomData (model) {
  return JSON.stringify(streamData[model][Math.floor(Math.random() * streamData[model].length)]);
}

function getUniqueId() {
  return socketIds++;
}

