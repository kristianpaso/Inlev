# BIGPLUS fish segmentation model

Place a compatible MediaPipe ImageSegmenter model at either of these paths:

`/bigplus/vendor/fish/fish_segmenter.task`

or

`/bigplus/vendor/fish/fish_segmenter.tflite`

The model must return a foreground confidence mask where the fish is the
foreground class. BIGPLUS loads the model locally when the file exists.
When it is absent, the page uses the clearly labelled local heuristic adapter.

The `.task` or `.tflite` file is not fabricated by the frontend. A useful trained model
needs labelled fish masks covering the supported species, poses, lighting,
occlusion, and backgrounds.
