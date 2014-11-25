var eventSupportMixin = {
  on: function(name, callback, target) {
    this._eventHandlers = this._eventHandlers || {};
    this._eventHandlers[name] = this._eventHandlers[name] || [];
    this._eventHandlers[name].push({
      callback: callback,
      target: target || this,
    });
  },

  off: function(name, callback) {
    if(this._eventHandlers && Array.isArray(this._eventHandlers[name])) {
      var i;
      for(i = this._eventHandlers[name].length - 1; i >= 0; i--) {
        if(this._eventHandlers[name].callback === callback) {
          this._eventHandlers.splice(i, 1);
        }
      }
    }
  },

  trigger: function(name) {
    var args = [].slice.call(arguments, 1);
    if(this._eventHandlers && Array.isArray(this._eventHandlers[name])) {
      this._eventHandlers[name].forEach(function(handler) {
        handler.callback.apply(handler.target, args);
      }, this);
    }
  }
};

var app = angular.module('tickerApp', ['ngRoute']).
  config(function($routeProvider) {
    $routeProvider.when('/', {
      controller: 'HomeController',
      templateUrl: 'home.html',
      controllerAs: 'ctrl',
    }).
    when('/detail/:ticker', {
      controller: 'DetailController',
      templateUrl: 'detail/detail.html',
      controllerAs: 'ctrl',
    }).
    otherwise({redirectTo: '/'});
  });

app.factory('socketParser', function() {
  return function parseMsg(msg) {
    var parsed = /(newdata):([a-zA-Z]*):([a-zA-Z]*):(.*)/.exec(msg);
    return parsed && parsed.length === 5 ? {
      model: parsed[2],
      query: parsed[3],
      data: JSON.parse(parsed[4])
    } : undefined;
  };
});

app.service('Stocks', function() {
  this.stocks = [{
    ticker: 'FB',
    name: 'Facebook',
    subscribe: false,
  },
  {
    ticker:  'GOOG',
    name: 'Google',
    subscribe: true,
  },
  {
    ticker:  'GOOGL',
    name: 'Google',
    subscribe: false,
  },
  {
    ticker: 'NFLX',
    name: 'Netflix',
    subscribe: false,
  }];

  this.stocksMap = this.stocks.reduce(function(prev, curr) {
    prev[curr.ticker] = curr;
    return prev;
  }, {});

  this.getStockByTicker = function (ticker) {
    return this.stocksMap[ticker];
  };

  this.get = function() {
    return this.stocks;
  };
});

app.factory('WebSocket', ['$window', function($window) {
  return $window.WebSocket;
}]);

app.factory('TickerSubscription', [function(){
  function TickerSubscription(model, query, stockTicker) {
    this.stockTicker = stockTicker;
    this.model = model;
    this.query = query;
    this.callbacks = [];

    stockTicker.on('message', this.messageHandler, this);
  }

  TickerSubscription.prototype = angular.extend({
    unsubscribe: function(){
      this.stockTicker.unsubscribe(this.model, this.query);
    },

    messageHandler: function(model, query, data, e) {
      if(this.model === model && this.query === query) {
        this.trigger('message', data, query, model, e);
      }
    }
  }, eventSupportMixin);


  return TickerSubscription;
}]);

app.factory('stockTicker', [
  'WebSocket', '$q', 'socketParser', '$rootScope', 'TickerSubscription', 
  function(WebSocket, $q, socketParser, $rootScope, TickerSubscription) { 
    function StockTicker() {
      this.sendOnConnect = [];
      this.messageHandlers = [];
      this._connectedDeferred = $q.defer();
      this.socket = new WebSocket('ws://localhost:8001');
      this.socket.onopen = this._socketOpen.bind(this);
      this.socket.onmessage = this._socketMessage.bind(this);
      this.socket.onclose = this._socketClose.bind(this);
    }

    StockTicker.prototype = angular.extend({
      _socketOpen: function(){
        this._connectedDeferred.resolve();
        this.trigger('open');
        while(this.sendOnConnect && this.sendOnConnect.length > 0) {
          var toSend = this.sendOnConnect.shift();
          this.send(toSend);
        }
      },

      _socketMessage: function(e){
        var parsed = socketParser(e.data);
        if(parsed) {
          $rootScope.$apply(function() {
            this.trigger('message', parsed.model, parsed.query, parsed.data, e);
          }.bind(this));
        }
      },

      _socketClose: function(){
        this.trigger('close');
      },

      send: function (data) {
        if(this.socket.readyState !== WebSocket.OPEN) {
          this.sendOnConnect.push(data);
        } else {
          var msg = typeof data === 'string' ? data : JSON.stringify(data);
          this.socket.send(msg);
        }
      },

      subscribe: function(model, query) {
        var sub = new TickerSubscription(model, query, this);
        console.log('send: "sub:' + model + ':' + query +'"');
        this.send('sub:' + model + ':' + query);
        return sub;
      },

      unsubscribe: function(model, query) {
        console.log('send: "unsub:' + model + ':' + query +'"');
        this.send('unsub:' + model + ':' + query);
      },

      connected: function() {
        return this._connectedDeferred.promise;
      },
    }, eventSupportMixin);

    return new StockTicker();
  }
]);

function HomeController($scope, Stocks, stockTicker) {
  this.stockTicker = stockTicker;
  this.subscriptions = [];
  this.stocks = Stocks.get();
  this.subscribeAll();

  $scope.$on('$destroy', this.unsubscribeAll.bind(this));
}

HomeController.prototype = {
  subscriptions: null,

  subscribeAll: function() {
    this.stocks.forEach(function(stock) {
      if(this.subscriptions.indexOf(stock.ticker) === -1) {
        var subscription = this.stockTicker.subscribe('tickerUpdates', stock.ticker);
        subscription.on('message', this.update, this);
        this.subscriptions.push(subscription);
      }
    }, this);
  },

  update: function(data, query, model, e) {
    var stock = this.stocks.filter(function(stock) {
      return stock.ticker === query;
    }).forEach(function(stock) {
      stock.ticks = stock.ticks || [];
      stock.ticks.push(data);
    });
  },

  unsubscribeAll: function(){
    var subscription;
    while(this.subscriptions.length > 0) {
      subscription = this.subscriptions.shift();
      subscription.unsubscribe();
    }
  },
};

app.controller('HomeController', ['$scope', 'Stocks', 'stockTicker', HomeController]);

function DetailController($scope, $routeParams, Stocks, stockTicker) {
  this.ticker = $routeParams.ticker;
  this.stock = Stocks.getStockByTicker(this.ticker);
  this.ticks = [];
  this.subscription = stockTicker.subscribe('tickerUpdates', this.ticker);
  this.subscription.on('message', this.update.bind(this));
  $scope.$on('$destroy', this.unsubscribe.bind(this));
}

DetailController.prototype = {
  update: function(data, query, model, e) {
    this.ticks.push(data);
  },

  unsubscribe: function(){
    this.subscription.unsubscribe();
  },
};

app.controller('DetailController', ['$scope', '$routeParams', 'Stocks', 'stockTicker', DetailController]);


