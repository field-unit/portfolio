# James Mason — portfolio website

The built website: nineteen projects, each opened from an object on a 3D desk, with a plain project index
and CV behind the same pages. It is a single HTML page with its images, models and Three.js beside it, and it
needs no server beyond a static host.

Everything here is **generated**. Nothing in this folder is edited by hand: it is written by
`build.py --web` in the portfolio project, which holds the writing, the photographs and the CAD. Any change
made here is overwritten the next time the site is built.

```
index.html        the page, with its styles, code and text
assets/img/       the photographs and drawings, as WebP
assets/models.json  James's CAD, simplified for the desk
assets/three.js   Three.js r160
og-image.jpg      the card shown when a link is shared
robots.txt        search engines: everything here may be indexed
.nojekyll         GitHub Pages: serve these files as they are
CNAME             the site's own domain (only once there is one)
```

Published with GitHub Pages: Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

© James Mason. The work shown is his, and some of it was done for employers; please don't reuse the
photographs, drawings or text.
