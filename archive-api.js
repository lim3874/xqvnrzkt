(function () {
  'use strict';
  var endpoint = 'https://script.google.com/macros/s/AKfycbxyuX5LrMqLzjCS2dhlyq8cHVcEMkE49xd2SUepFb-YlO4H61eHzbPqQ9tSOWMtdxS6/exec';
  var key = 'archive-public-data-v1';
  var snapshot = window.ARCHIVE_BOOTSTRAP || {items: [], updatedAt: 0};
  try {
    var saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && Array.isArray(saved.items) && saved.updatedAt > snapshot.updatedAt) snapshot = saved;
  } catch (error) {}
  var all = snapshot.items;
  function duration(value) {
    return String(value || '').split(':').reduce(function (sum, part) {return sum * 60 + Number(part);}, 0);
  }
  function date(value) {
    var p = String(value || '').split('/');
    return p.length === 3 ? Date.UTC(+p[2], +p[0] - 1, +p[1]) : 0;
  }
  function bucket(value) {
    var n = duration(value);
    return !value ? '' : n <= 120 ? '0-2' : n <= 300 ? '2-5' : n <= 600 ? '5-10' : n <= 1500 ? '10-25' : '25-plus';
  }
  function page(params) {
    params = params || {};
    var q = String(params.query || '').trim().toLowerCase().replace(/^#/, '');
    var filtered = all.filter(function (item) {
      var tags = String(item.tags || '').toLowerCase().split(/[,;]+/).map(function (x) {return x.trim();});
      var parts = String(item.releaseDate || '').split('/');
      var selected = String(params.releaseDate || '').split('-');
      return (!q || String(item.title || '').toLowerCase().includes(q) || tags.includes(q)) &&
        (!params.category || String(item.category).toLowerCase() === String(params.category).toLowerCase()) &&
        (!params.length || bucket(item.length) === params.length) &&
        (!selected[0] || parts[2] === selected[0]) && (!selected[1] || Number(parts[0]) === Number(selected[1]));
    });
    var sort = ['title', 'category', 'length', 'releaseDate'].includes(params.sort) ? params.sort : 'releaseDate';
    filtered.sort(function (a, b) {
      var x = sort === 'releaseDate' ? date(a[sort]) : sort === 'length' ? duration(a[sort]) : String(a[sort] || '');
      var y = sort === 'releaseDate' ? date(b[sort]) : sort === 'length' ? duration(b[sort]) : String(b[sort] || '');
      var result = typeof x === 'number' ? x - y : x.localeCompare(y);
      return params.direction === 'asc' ? result : -result;
    });
    var size = [25, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
    var number = Math.min(Math.max(1, Number(params.page) || 1), Math.max(1, Math.ceil(filtered.length / size)));
    return {items: filtered.slice((number - 1) * size, number * size), total: filtered.length, page: number, pageSize: size,
      categories: Array.from(new Set(all.map(function (x) {return x.category;}).filter(Boolean))).sort(),
      releaseDates: Array.from(new Set(all.map(function (x) {return x.releaseDate;}).filter(Boolean))).sort(function(a,b){return date(b)-date(a);})};
  }
  function runner(success, failure) {
    return {
      withSuccessHandler: function (fn) {return runner(fn, failure);},
      withFailureHandler: function (fn) {return runner(success, fn);},
      getLibraryPage: function (params) {Promise.resolve().then(function () {return page(params);}).then(success, failure);},
      resolveEsThumbnailUrls: function (items) {
        var urls = items.map(function (item) {
          var row = all.find(function (x) {return x.category === item.category && x.title === item.title;});
          return row ? row.image || '' : '';
        });
        Promise.resolve(urls).then(success, failure);
      }
    };
  }
  var initial = page({page: 1, pageSize: 25});
  window.ARCHIVE_ALL = all;
  window.ARCHIVE_DATA = initial.items;
  window.ARCHIVE_META = initial;
  window.google = {script: {run: runner(function () {}, function () {})}};
  var pending = false;
  function status(text) {
    var target = document.getElementById('syncStatus');
    if (target) target.textContent = text;
  }
  function refresh() {
    if (pending || document.hidden) return;
    pending = true;
    var callback = 'archiveCallback_' + Date.now().toString(36);
    var script = document.createElement('script');
    var timeout;
    function cleanup() {clearTimeout(timeout); script.remove(); delete window[callback]; pending = false;}
    window[callback] = function (data) {
      cleanup();
      if (!data || !Array.isArray(data.items) || !data.items.length) {
        status('Showing saved archive. Retrying automatically.'); return;
      }
      snapshot = {items: data.items, updatedAt: Date.now()};
      all = data.items;
      window.ARCHIVE_ALL = all;
      try {localStorage.setItem(key, JSON.stringify(snapshot));} catch (error) {}
      window.dispatchEvent(new CustomEvent('archive:data'));
      status('Updated ' + new Date(snapshot.updatedAt).toLocaleTimeString());
    };
    script.onerror = function () {cleanup(); status('Showing saved archive. Retrying automatically.');};
    timeout = setTimeout(script.onerror, 20000);
    script.src = endpoint + '?action=archive-data&callback=' + callback;
    document.head.appendChild(script);
  }
  window.archivePage = page;
  window.archiveRefresh = refresh;
  window.addEventListener('DOMContentLoaded', function () {setTimeout(refresh, 0);});
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', function () {if (Date.now() - snapshot.updatedAt > 60000) refresh();});
})();
