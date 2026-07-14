# ONNX Model Directory

Place your pre-trained license plate detector model in this directory.

- Filename: `license-plate-detector.onnx`
- Path: `/public/models/license-plate-detector.onnx`

## Recommended Model Setup

You can use a YOLOv8-based model trained on vehicle license plates (such as a standard custom YOLOv8 model exported to ONNX format).

### Model Requirements:
1. **Input**: A single tensor of shape `[1, 3, 640, 640]` with float32 values.
2. **Output**: A tensor containing bounding boxes and confidence scores (e.g. `[1, 5, 8400]`).
3. **Execution Provider**: Runs locally in the browser using WASM.

If the model file is not present in this folder, the application will display a warning and fall back to Manual Rectangle Selection, remaining 100% functional.
