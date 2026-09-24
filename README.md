# James Mason — portfolio website

The built website: twenty-two projects, each opened from an object on a 3D desk, each with a page of its own,
with a project index and a CV. Plain static files; no server beyond a static host.

Everything here is **generated**. Nothing in this folder is edited by hand: it is written by
`build.py --web` in the portfolio project, which holds the writing, the photographs and the CAD. Any change
made here is overwritten the next time the site is built.

```
index.html                 the desk (the name, role and disciplines as text; every project listed without JavaScript)
projects/index.html        the project index
projects/<slug>/index.html one page per project
cv/index.html              CV and contact
404.html                   page not found, with every project listed
assets/app.<hash>.js       the pages' own script: moving between pages, galleries, the desk's labels
assets/desk.<hash>.js      Three.js r160 and the scene, loaded only when the desk is shown
assets/models.<hash>.bin   James's CAD, simplified for the desk and packed (models.<hash>.json: the same, unpacked)
assets/img/                the photographs and drawings, as WebP, each with a 480-pixel copy
og/<slug>.jpg              each project's link-preview card; og-image.jpg is the site's own
favicon.ico, favicon.svg, apple-touch-icon.png
remote-object/             Remote Object, the instrument its project page opens
robots.txt, sitemap.xml    search engines: everything here may be indexed, and where the pages are
.nojekyll                  GitHub Pages: serve these files as they are
CNAME                      the site's own domain
```

Published with GitHub Pages: Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

© James Mason. The work shown is his, and some of it was done for employers; please don't reuse the
photographs, drawings or text.
