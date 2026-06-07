export default {
  fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'http:';
    url.hostname = '2a01-4f8-171-3481--106.sslip.io';
    url.port = '80';
    return fetch(new Request(url, request));
  },
};
