---
layout: home

hero:
  name: ResearchTree
  text: An island where research grows
  tagline: One branch per experiment, one PR per lab note. Your records grow into trees on a small island.
  image:
    src: /logo.svg
    alt: A tree smiling on a small voxel island
  actions:
    - theme: brand
      text: Get started
      link: /guide/introduction
    - theme: alt
      text: Research rules
      link: /rules/branches
    - theme: alt
      text: GitHub
      link: https://github.com/DarkPyonix/researchtree

features:
  - icon: 🌱
    title: One branch = one experiment
    details: Each experiment gets a branch holding one small, clear code change. How experiments derive from each other becomes the tree.
    link: /rules/branches
    linkText: Branch rules
  - icon: 📓
    title: One PR = one lab note
    details: The YAML block at the top of the PR body holds the hypothesis, the change and the metrics. Merged means adopted, closed means rejected.
    link: /rules/pull-requests
    linkText: PR format
  - icon: 📐
    title: Intent- and spec-driven development
    details: Spec-driven development (SDD), adapted to research. A spec change is the hypothesis, and adopting or rejecting the experiment decides whether it goes into the spec. Claims in the intent document link to experiments too.
    link: /rules/spec
    linkText: Intent- and spec-driven development
  - icon: 🔭
    title: Open science
    details: Failed experiments and abandoned ideas stay in the repository. Make the repository public and the whole research process is public.
    link: /guide/introduction
    linkText: Read the introduction
---

::: tip Start now
The [hosted web viewer](https://darkpyonix.github.io/researchtree/) works right away with a GitHub sign-in. Install the Python package with `pip install researchtree`, and the VS Code extension from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=darkpyonix.researchtree). See [Getting started](/guide/introduction) for details.
:::

<div class="rt-showcase">
<div>
<p class="rt-eyebrow">The research island</p>
<h2>One island per research version</h2>
<p>Each research version floats as its own island, and experiments grow in garden plots at the end of dirt paths. The plant tells you how an experiment ended.</p>
<ul class="rt-legend">
<li><b>🌳 Tree</b><span>Adopted experiment, with fruit and a fence</span></li>
<li><b>🌿 Sapling</b><span>Running experiment</span></li>
<li><b>🪵 Stump</b><span>Rejected experiment</span></li>
<li><b>🗿 Monument</b><span>A research version. Ferries cross between islands</span></li>
</ul>
<p><a href="/researchtree/guide/viewer/island">How to read the island →</a></p>
</div>
<figure class="rt-frame">
<div class="rt-dots"><i></i><i></i><i></i></div>
<img src="/images/readme/en/island.png" alt="The 3D research island: experiments drawn as plants and research versions as stone monuments on a voxel island">
<figcaption>The real viewer. Drag to move, scroll to zoom.</figcaption>
</figure>
</div>
