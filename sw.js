var monetagConfigs = {
    first: {
        domain: "3nbf4.com",
        zoneId: 10879673
    },
    second: {
        domain: "3nbf4.com",
        zoneId: 10879733
    }
};

// Pilih versi aktif: "first" atau "second"
var activeConfigKey = "second";

self.options = monetagConfigs[activeConfigKey];
self.lary = "";
importScripts('https://3nbf4.com/act/files/service-worker.min.js?r=sw');
