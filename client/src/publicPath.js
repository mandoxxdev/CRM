/* eslint-disable no-undef, camelcase */
// Force absolute chunk URLs from site root (fixes ChunkLoadError on /comercial/* etc.)
// when homepage was "." and a full page reload resolves ./static/js relative to the route.
__webpack_public_path__ = '/';
