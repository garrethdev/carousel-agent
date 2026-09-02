# How to make a Vox Style video: Full Prompts & Template

> Source article by @seergioo_gil — https://x.com/seergioo_gil/status/2094082937402581220  
> Scraped via ScrapeCreators. Prohibited/verbatim prompt text lives in `prompts/`.

a vox style video runs on a look you already know: halftone cutouts, redacted eyes, archival maps and one hot red accent on aged paper.

getting that look on a single frame is easy. getting it on every scene of a 60 second short, cut to a narration, is the hard part.

> this article gives you the three prompts that built the example short below, copied verbatim, plus the six reference images and the exact settings behind them.

## what you need

- the six reference images below (save each one)

- the three prompts on this page: the master agent prompt, the image prompt and the video prompt

- a topic. if you don't have one, the agent proposes three documentary hooks that open with a number or a date

## 1. grab the reference images

the prompts describe the style. the references prove it. words like "archival tan" or "torn paper edge" mean twenty different things until an actual image pins them down. a project template that carries both text and pictures locks the style far tighter than text alone.

six images is enough: one master sheet and five shot examples covering the situations a documentary collage explainer keeps running into.

*(image 1 — see `reference-images/`)*

*(image 2 — see `reference-images/`)*

*(image 3 — see `reference-images/`)*


*(image 4 — see `reference-images/`)*

*(image 5 — see `reference-images/`)*

*(image 6 — see `reference-images/`)*

> the references are the part people skip, and it's the part that decides whether scene 9 still looks like scene 1. a prompt sets intent. a reference sets the ceiling.

## 2. build the template

everything lives in one place: your project template, in the visuals lab. you're teaching calliope one stage, one palette and one set of physics, so every clip it generates later belongs to the same short.

1. paste the image prompt and the video prompt into the chat and attach the six references in the same message

1.  set it up: shorts, narrator on, animated on, image extra high, video high

1. check the visual references panel shows all six, then save the shorts template

*(image 7 — see `reference-images/`)*

*(image 8 — see `reference-images/`)*

> keep the two prompts in separate fields.

the image prompt goes to visual_style and describes surfaces, palette, typography and prohibitions. the video prompt goes to video_style and describes camera, entrances, rhythm and transitions. mixing them is the single most common reason a documentary collage video comes out flat.

or skip all of this. the master agent prompt below does every one of these sub-steps for you, in one paste.


## Part 1. the Master agent Prompt

paste it into claude with the calliope mcp connected, attach the six references, then paste the image prompt and the video prompt right after it. from there the agent builds the project template, writes a timestamped storyboard, quotes you the exact cost and waits. it asks you two questions total: your topic, and a yes on the price.

copy it as is.

> You are my Calliope video producer. Use the Calliope MCP tools end to end. Ask me only two things: the topic, and a yes on the cost. Everything else is decided below.

> 1. TEMPLATE. Read chat-style/create-video-best-practices and image-style/IMAGE-STYLE-CREATOR via read_skill. Then call create_template with content_type "short", name "Vox Documentary Collage", description "Hand-cut documentary paper collage explainers, Vox style". Upload the 6 reference images I attached with register_upload and pass them as source.visual_references. Put the IMAGE PROMPT I paste next into source.visual_style and the VIDEO PROMPT into video_style, both verbatim, no rewriting, no shortening. Settings: voiceover true, animate true, captions true, custom quality with image "extra" and video "high". Do not add scripting_style.

> 2. BRIEF. Ask me for the topic. If I have none, propose 3 documentary hooks that open with a number or a date. Write content_instructions as a timestamped storyboard for a 45 to 60 second short: a hook stat in the first 2 seconds, one idea per beat, one red-accent element per scene, narrator only, no on-screen dialogue. Every scene must fit the collage stage: cutouts, stat cards, map pins, paper strips. Public figures get the black eye bar.

> 3. PRICE. Call estimate_generation_cost with target_duration_sec 60 on that template and show me the exact number. Wait for my yes.

> 4. GENERATE. create_video, content_type "short", source.template_id, auto_accept false. Poll get_job every 60 seconds and stop between polls. Show me the character reference sheet (character_reference, then get_clip sheet_index 0) before resuming; resume_job to assets, then to render.

> 5. DELIVER. When Completed, give me the video, then create 3 thumbnails with the closest thumbnail style. Never modify my two prompts. Never pick other models. Never render without my confirmation.


## Part 2. the Image Prompt

this is visual_style: what every frame looks like, with no motion in it. the key idea is the persistent stage. instead of describing nine unrelated pictures, it describes one muted archival map surface that every clip lives on, so cutouts and stat cards feel like they enter and exit the same tabletop.

> A hand-cut documentary paper collage on aged newsprint and archival map surfaces. The persistent stage is a muted archival map/texture field, empty, pre-lit, evenly toned, ready for cutouts and stat cards to enter and exit. Every clip lives on this same stage.

> SURFACE & MOOD: aged archival paper / muted map texture field, visible grain and print texture. Mood: newsroom-serious, layered, tactile, slightly retro. Finish: print grain, halftone dot texture, torn-paper edges, matte finish, no glossy 3D, no lens flares.

> COLLAGE MATERIALS: black and white halftone photograph cutouts with rough scissor-cut edges and offset accent strokes; torn paper edges; masking tape fragments; typewriter caption strips; rubber stamp marks; red string and brass pins where the story calls for connections. Every element must appear physically hand-cut and layered from real paper, with visible cutout edges, halftone print texture, and soft cutout drop shadows.

> PALETTE: desaturated archival palette of tan, ink black, and halftone gray with ONE hot red signal accent and a restrained mustard yellow secondary. Exact swatches: Archival Tan #C9BB9C, Ink Black #1A1A1A, Halftone Gray #8C8C8C, Hot Red #D62E1F, Mustard #D9A441. Red is reserved for strokes, underlines, arrows, stat counters and emphasis; mustard is secondary accent only.

> TYPOGRAPHY: condensed bold headline caps only where a label is specified. H1 headlines are huge and dominant. Stat numbers like "$116" are treated as hero characters. Small annotation labels like "Fig. 3 - Trade Route" are typewriter-style. Typography aligned, sharp, no warped letters. No watermarks, no lorem ipsum, no unrelated logos, no random gibberish text: every visible word must be intentional.

> COMPOSITION RULES: one hero element (dominant, about 70 percent of visual weight), 2-3 supporting elements maximum, generous negative space. If the beat carries a date, a name, or a number, it may appear as ONE short label of 1-4 words on a paper strip or stamp. Otherwise no text.

> COMPONENT ZOO: black-and-white halftone cutouts of figures with a rough white keyline and an offset red stroke behind them; torn-paper edge cards; big red stat counter cards; map pin markers; red underline swipes beneath headline words; archival photo cards with a thin white border. All share one construction logic: halftone texture, offset stroke pop.

> FIGURE TREATMENT: when depicting real public figures or anonymous subjects in documentary beats, their eyes may be censored with a solid black horizontal bar across the eyes, like a redacted identity photo. The bar is ink-black, flat, slightly rough-edged, integrated into the halftone cutout.

> LIGHTING: flat even documentary lighting with soft cutout drop shadows. No dramatic chiaroscuro, no colored lights, no glossy reflections.

> PROHIBITIONS: no glossy 3D, no lens flares, no gradients on cutouts, no neon, no motion blur baked into stills, no AI-looking smoothness, no unrelated logos, no lorem ipsum, no watermarks.


## Part 3. the Video Prompt

this is video_style: how the clips move, with no colors in it. every rule here is a physical rule. cutouts spring and settle, counters tick, pins drop and wobble once, labels type on like a strip being pulled. text never fades in transparently, because paper doesn't fade in.

> Editorial documentary motion for short-form explainers. The camera treats the collage stage as a physical tabletop that can be explored, not as a 3D world.

> CAMERA BEHAVIOR: slow 2% drift across the stage, gentle micro-pushes in and out, subtle simulated rack focus between paper layers. Never fast zooms, never shaky cam, never spinning camera, never parallax exaggeration. The camera holds most beats with a calm, newsroom authority.

> ELEMENT ENTRANCES: cutouts spring up with slight overshoot and settle; stat counters tick upward with mechanical precision; red underline swipes beneath a headline word from left to right; map pins drop and wobble once; photo cards slide in with a soft paper shuffle; torn-paper cards peel into frame. Every motion should feel like a physical paper element being manipulated by an invisible editor.

> RHYTHM: cuts every 1-3 seconds in sync with narration beats. Each cut lands on a new composition or a new element entering. Pacing is brisk but never frantic. Silence beats are held on a static frame with only the slow drift.

> TEXT & COUNTER MOTION: numbers count up; headline words are revealed by red underline swipes or by paper strips sliding into place; labels type on like a typewriter strip being pulled. Text never fades in transparently: it always arrives as a physical object.

> TRANSITIONS: hard cuts between scenes, occasionally a paper wipe or a torn-edge reveal. No dissolves, no star wipes, no 3D transitions, no lens flares.

> LAYER MOTION: foreground cutouts may shift slightly against the map background to create depth, but the background stage stays locked. Red strings and brass pins can draw themselves across the stage to connect elements when the story calls for connections.

> PROHIBITIONS: no character lip-sync, no full-body character animation, no 3D camera fly-throughs, no particle effects, no glows, no speed ramps, no handheld shake.


## 3. generate the Short or Video

with the template saved, the creation lab handles the script, the character reference sheet and the shoot. you're only approving decisions.

1. open the creation lab with your template selected and give it your topic, or ask the agent for one

1. approve the character reference sheet when it comes back. it's what keeps every cutout on model from the first beat to the last

1. hit start generation. the timeline lands with clips, captions, narration and sfx, all editable

*(image 9 — see `reference-images/`)*

*(image 10 — see `reference-images/`)*

approving the character reference sheet is not a formality. it's the last cheap moment to fix a face, a silhouette or a treatment before the whole short is generated against it.

## common mistakes

- writing motion words like "slow push in" into the image prompt, which bakes fake blur into stills instead of moving the camera

- letting the red accent spread onto backgrounds and multiple elements, when it's reserved for strokes, underlines, arrows, stat counters and emphasis only

- filling frames with five or six cutouts, instead of one hero element at about 70% of the visual weight with two or three supporting pieces

- attaching the prompts but not the six references, then wondering why scene 7 looks like a different show than scene 1

- asking for paragraphs of on-screen text, when the style allows one short label of 1 to 4 words on a paper strip or a stamp

## faq

**what is a vox style video?**

a short documentary explainer built from hand-cut paper collage: halftone black and white cutouts, torn edges, archival maps, typewriter labels and one hot red signal accent. the camera treats the collage as a physical tabletop rather than a 3d world. it's a look, not a topic, so it works for history, money, crime and geopolitics alike.

**can i make vox style shorts without editing skills?**

yes. you paste one prompt pack into calliope, approve the character reference sheet and press start generation, and the timeline comes back with clips, captions, narration and sound effects already assembled.

**why does my documentary collage video look glossy and 3d instead of hand-cut?**

because the prohibitions list is missing or was rewritten. the image prompt has to explicitly ban glossy 3d, lens flares, gradients on cutouts, neon and smooth finishes, and it has to demand print grain, halftone dots, torn edges and soft cutout drop shadows. paste it verbatim, and attach the reference images so there's a visual floor as well as a written one.

**what settings should i use for a paper collage explainer?**

shorts, narrator on, animated on, image quality extra high, video quality high. extra high on the image side matters most, because halftone dots, torn fibres and typewriter labels are fine detail that collapses first when image quality drops.

## make your own

same three prompts, any topic you want, no editing timeline to learn first. start free at calliopelabs.co and have your first vox style short planned in a few minutes.
