export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "www.qianx.ai") {
      url.hostname = "qianx.ai";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/ByteDanceVerify.html") {
      return new Response("4Sb5xFE5CyRm+8oQeiSz", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
