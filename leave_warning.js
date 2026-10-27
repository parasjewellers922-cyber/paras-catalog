// Warns before the website is closed or reloaded while photos are still
// uploading (the website can't keep them once the page is closed).
// Called from lib/platform/leave_warning_web.dart.
(function () {
  var on = false;
  window.parasSetLeaveWarning = function (value) { on = !!value; };
  window.addEventListener('beforeunload', function (e) {
    if (!on) return undefined;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });
})();
