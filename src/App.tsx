import React, { useState, useRef, useEffect } from 'react';
import { Upload, Wand2, Image as ImageIcon, Loader2, Download, RefreshCcw, X, Plus, Scissors, Move, Layers, MousePointer2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Stage, Layer, Image as KonvaImage, Transformer, Rect, Text, Line } from 'react-konva';
import useImage from 'use-image';
import { editImage, ImageInput } from './services/geminiService';

interface Asset {
  id: string;
  url: string;
  base64: string;
  mimeType: string;
  name: string;
  width: number;
  height: number;
}

interface CanvasElement {
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface RoomElement {
  id: string;
  type: 'wall' | 'window' | 'door' | 'bed' | 'sofa' | 'table' | 'cabinet' | 'camera';
  x: number;
  y: number;
  width: number;
  height: number;
  thickness?: number; // For walls/windows/doors
  depth?: number; // For SU-like extrusion
  rotation: number;
}

const DraggableImage = ({ 
  element, 
  asset,
  isSelected, 
  onSelect, 
  onChange 
}: { 
  element: CanvasElement, 
  asset: Asset,
  isSelected: boolean, 
  onSelect: () => void, 
  onChange: (newAttrs: any) => void 
}) => {
  const [img] = useImage(asset.url);
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <React.Fragment>
      <KonvaImage
        image={img}
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        {...element}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...element,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...element,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
            rotation: node.rotation(),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </React.Fragment>
  );
};

export default function App() {
  const [background, setBackground] = useState<Asset | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [canvasElements, setCanvasElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<string[]>([]);
  const [bgImage] = useImage(background?.url || '');
  const [stageSize, setStageSize] = useState({ width: 800, height: 450 });

  useEffect(() => {
    if (bgImage) {
      const maxWidth = 800;
      const maxHeight = 600;
      let width = bgImage.width;
      let height = bgImage.height;

      const ratio = width / height;
      if (width > maxWidth) {
        width = maxWidth;
        height = width / ratio;
      }
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
      setStageSize({ width, height });
    } else {
      setStageSize({ width: 800, height: 450 });
    }
  }, [bgImage]);
  const [roomElements, setRoomElements] = useState<RoomElement[]>([]);
  const [roomMaterial, setRoomMaterial] = useState('Modern Minimalist');
  const [isRoomBuilderOpen, setIsRoomBuilderOpen] = useState(false);
  const [selectedRoomElId, setSelectedRoomElId] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [processingAssetId, setProcessingAssetId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const stageRef = useRef<any>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File, isBackground: boolean) => {
    if (!file.type.startsWith('image/')) {
      setError("Please upload an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setError("Failed to read file.");
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      
      const img = new Image();
      img.onerror = () => setError("Failed to load image. The file might be corrupted or not a valid image.");
      img.onload = () => {
        const id = Math.random().toString(36).substr(2, 9);
        const newAsset: Asset = {
          id,
          url: URL.createObjectURL(file),
          base64,
          mimeType: file.type,
          name: file.name,
          width: img.width,
          height: img.height,
        };

        if (isBackground) {
          setBackground(newAsset);
        } else {
          setAssets(prev => [...prev, newAsset]);
        }
        setResultImage(null);
        setError(null);
        
        // Clear input values to allow uploading the same file again
        if (bgInputRef.current) bgInputRef.current.value = '';
        if (assetInputRef.current) assetInputRef.current.value = '';
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file, false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const addToCanvas = (asset: Asset) => {
    const id = Math.random().toString(36).substr(2, 9);
    
    // Calculate initial size while maintaining aspect ratio
    const maxWidth = 400;
    const maxHeight = 300;
    let width = asset.width;
    let height = asset.height;
    
    if (width > maxWidth) {
      height *= maxWidth / width;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width *= maxHeight / height;
      height = maxHeight;
    }

    const newElement: CanvasElement = {
      id,
      assetId: asset.id,
      x: stageSize.width / 2 - width / 2,
      y: stageSize.height / 2 - height / 2,
      width,
      height,
      rotation: 0,
    };
    setCanvasElements(prev => [...prev, newElement]);
    setSelectedId(id);
  };

  const moveElement = (direction: 'front' | 'back') => {
    if (!selectedId) return;
    const index = canvasElements.findIndex(el => el.id === selectedId);
    if (index === -1) return;

    const newElements = [...canvasElements];
    const element = newElements.splice(index, 1)[0];
    
    if (direction === 'front') {
      newElements.push(element);
    } else {
      newElements.unshift(element);
    }
    
    setCanvasElements(newElements);
  };

  const handleEdit = async () => {
    if (!background && canvasElements.length === 0) return;
    if (!prompt.trim()) return;

    setIsProcessing(true);
    setError(null);
    try {
      setSelectedId(null);
      await new Promise(r => setTimeout(r, 100));
      const compositionUri = stageRef.current.toDataURL();
      const compositionBase64 = compositionUri.split(',')[1];

      const images: ImageInput[] = [];
      if (background) images.push({ base64: background.base64, mimeType: background.mimeType });
      
      // Add unique assets used on canvas
      const usedAssetIds = new Set(canvasElements.map(e => e.assetId));
      assets.filter(a => usedAssetIds.has(a.id)).forEach(asset => {
        images.push({ base64: asset.base64, mimeType: asset.mimeType });
      });

      images.push({ base64: compositionBase64, mimeType: 'image/png' });

      const fullPrompt = `The last image is a composition of the previous images. Please ${prompt} to make it look realistic and professionally blended. Maintain positions and relative sizes.`;

      const editedImageUrl = await editImage({ images, prompt: fullPrompt });

      if (editedImageUrl) {
        setResultImage(editedImageUrl);
        setHistoryList([editedImageUrl, ...historyList].slice(0, 10));
      } else {
        setError("Processing failed. Try a different prompt.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSmartCutout = async (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    setProcessingAssetId(assetId);
    setError(null);
    try {
      const result = await editImage({
        images: [{ base64: asset.base64, mimeType: asset.mimeType }],
        prompt: "Remove the background from this image. Return ONLY the main subject on a PURE TRANSPARENT background. The output MUST be a PNG with an alpha channel. Do not include any shadows or reflections from the original background. Ensure the subject is perfectly extracted."
      });
      if (result) {
        const base64 = result.split(',')[1];
        setAssets(prev => prev.map(a => a.id === assetId ? { ...a, url: result, base64, mimeType: 'image/png' } : a));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cutout failed. Please try again.");
    } finally {
      setProcessingAssetId(null);
    }
  };

  const handleGenerate3D = async (assetId: string, anglePrompt: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    setProcessingAssetId(assetId);
    setError(null);
    try {
      const result = await editImage({
        images: [{ base64: asset.base64, mimeType: asset.mimeType }],
        prompt: `Re-render this subject from a ${anglePrompt}. Maintain the exact identity, colors, and details of the subject. Return the subject on a PURE TRANSPARENT background as a PNG with an alpha channel. The subject should look like a 3D model viewed from the specified angle. Ensure no background pixels remain.`
      });
      if (result) {
        const base64 = result.split(',')[1];
        setAssets(prev => prev.map(a => a.id === assetId ? { ...a, url: result, base64, mimeType: 'image/png' } : a));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "3D generation failed. Please try again.");
    } finally {
      setProcessingAssetId(null);
    }
  };

  const roomStageRef = useRef<any>(null);

  const [isIsometric, setIsIsometric] = useState(false);
  const [isInpainting, setIsInpainting] = useState(false);
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [inpaintLines, setInpaintLines] = useState<any[]>([]);
  const [showInpaintOriginal, setShowInpaintOriginal] = useState(false);
  const inpaintCanvasRef = useRef<any>(null);

  const handleInpaint = async () => {
    if (!resultImage || !inpaintPrompt.trim()) return;
    setIsProcessing(true);
    setError(null);
    try {
      const maskUri = inpaintCanvasRef.current.toDataURL();
      const maskBase64 = maskUri.split(',')[1];
      const resultBase64 = resultImage.split(',')[1];

      const result = await editImage({
        images: [
          { base64: resultBase64, mimeType: 'image/png' },
          { base64: maskBase64, mimeType: 'image/png' }
        ],
        prompt: `The second image is a mask (red paint) indicating the area to modify in the first image. Please ${inpaintPrompt} in that specific area while keeping the rest of the image exactly the same. Ensure the style and lighting match perfectly.`
      });

      if (result) {
        setResultImage(result);
        setHistoryList([result, ...historyList].slice(0, 10));
        setIsInpainting(false);
        setInpaintPrompt('');
        setInpaintLines([]);
      }
    } catch (err) {
      setError("Inpainting failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsProcessing(false);
    }
  };
  const handleGenerateRoom = async () => {
    if (roomElements.length === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      const camera = roomElements.find(el => el.type === 'camera');
      setSelectedRoomElId(null);
      await new Promise(r => setTimeout(r, 100));
      const roomUri = roomStageRef.current.toDataURL();
      const roomBase64 = roomUri.split(',')[1];

      const cameraInfo = camera 
        ? `The camera is located at (${camera.x}, ${camera.y}) and rotated ${camera.rotation} degrees. Please generate the 3D view from this specific perspective.`
        : "Generate a natural perspective view of the room.";

      const elementDetails = roomElements.map(el => 
        `- ${el.type.toUpperCase()}: Length ${el.width}cm, Thickness/Width ${el.height}cm, Height ${el.depth || 0}cm, Rotation ${el.rotation}°`
      ).join('\n');

      const result = await editImage({
        images: [{ base64: roomBase64, mimeType: 'image/png' }],
        prompt: `Convert this SketchUp/Kujiale-style floor plan into a professional 3D interior render. 
        Style: ${roomMaterial}. 
        ${cameraInfo}
        
        Detailed Element Specifications:
        ${elementDetails}
        
        The layout includes walls, windows, doors, and furniture with specific dimensions as listed above. 
        Create a realistic, high-end architectural visualization with accurate lighting, materials, and spatial depth. 
        Ensure the walls have the specified thickness and height.`
      });

      if (result) {
        const base64 = result.split(',')[1];
        const newAsset: Asset = {
          id: Math.random().toString(36).substr(2, 9),
          url: result,
          base64,
          mimeType: 'image/png',
          name: `SU Render - ${roomMaterial}`,
          width: 1920, // Default for generated high-res
          height: 1080,
        };
        setBackground(newAsset);
        setIsRoomBuilderOpen(false);
      }
    } catch (err) {
      setError("Room generation failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsProcessing(false);
    }
  };

  const addRoomElement = (type: RoomElement['type']) => {
    const id = Math.random().toString(36).substr(2, 9);
    let width = 100;
    let height = 100;
    let thickness = 15;
    let depth = 240; // Default wall height in cm

    switch(type) {
      case 'wall': width = 200; height = 15; thickness = 15; break;
      case 'window': width = 80; height = 15; thickness = 10; break;
      case 'door': width = 60; height = 15; thickness = 10; break;
      case 'bed': width = 120; height = 150; break;
      case 'sofa': width = 150; height = 80; break;
      case 'table': width = 80; height = 80; break;
      case 'cabinet': width = 100; height = 40; break;
      case 'camera': width = 30; height = 30; break;
    }

    const newEl: RoomElement = {
      id,
      type,
      x: 250,
      y: 180,
      width,
      height,
      thickness,
      depth,
      rotation: 0,
    };
    setRoomElements([...roomElements, newEl]);
    setSelectedRoomElId(id);
  };

  const reset = () => {
    setBackground(null);
    setAssets([]);
    setCanvasElements([]);
    setResultImage(null);
    setPrompt('');
    setError(null);
    setSelectedId(null);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-zinc-900 font-sans selection:bg-emerald-100">
      <header className="border-b border-zinc-200 bg-white/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/20">
              <Wand2 size={20} />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight leading-none">Lumina Studio</h1>
              <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold mt-1">AI Composition Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {(background || assets.length > 0) && (
              <button onClick={reset} className="text-sm font-semibold text-zinc-400 hover:text-zinc-900 transition-colors flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-zinc-100">
                <RefreshCcw size={14} /> Reset
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 grid lg:grid-cols-12 gap-6 h-[calc(100vh-80px)]">
        {/* Sidebar: Assets & Controls */}
        <div className="lg:col-span-3 flex flex-col gap-6 overflow-y-auto pr-2">
          {/* Background Section */}
          <section className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
              <ImageIcon size={14} /> 1. Background
            </h2>
            {!background ? (
              <div className="space-y-3">
                <button 
                  onClick={() => bgInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-zinc-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                >
                  <Plus size={20} className="text-zinc-300 group-hover:text-emerald-500" />
                  <span className="text-xs font-bold text-zinc-400 group-hover:text-emerald-600">Upload Base</span>
                  <input type="file" ref={bgInputRef} onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0], true)} className="hidden" accept="image/*" />
                </button>
                <button 
                  onClick={() => setIsRoomBuilderOpen(true)}
                  className="w-full bg-zinc-900 text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors"
                >
                  <Layers size={14} /> 3D Room Builder
                </button>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden aspect-video bg-zinc-100 group">
                <img src={background.url} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => bgInputRef.current?.click()} className="bg-white p-2 rounded-lg hover:scale-110 transition-transform"><RefreshCcw size={14} /></button>
                  <button onClick={() => setBackground(null)} className="bg-white text-red-600 p-2 rounded-lg hover:scale-110 transition-transform"><X size={14} /></button>
                </div>
              </div>
            )}
          </section>

          {/* Subjects Library */}
          <section 
            className={`bg-white rounded-2xl p-5 border shadow-sm flex-1 flex flex-col min-h-[300px] transition-all ${isDragging ? 'border-emerald-500 bg-emerald-50/50 ring-4 ring-emerald-500/10' : 'border-zinc-200'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Layers size={14} /> 2. Subjects
              </h2>
              <button 
                onClick={() => assetInputRef.current?.click()} 
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors text-xs font-bold"
              >
                <Plus size={14} /> Add Subject
              </button>
              <input type="file" ref={assetInputRef} onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0], false)} className="hidden" accept="image/*" />
            </div>
            
            <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 flex-1">
              {assets.map((asset) => (
                <div key={asset.id} className="group relative rounded-xl overflow-hidden border border-zinc-100 bg-zinc-50 aspect-square">
                  <img src={asset.url} className={`w-full h-full object-cover transition-opacity ${processingAssetId === asset.id ? 'opacity-30' : 'opacity-100'}`} />
                  
                  {processingAssetId === asset.id && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="animate-spin text-emerald-600" size={24} />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <button 
                      onClick={() => addToCanvas(asset)}
                      disabled={!!processingAssetId}
                      className="w-full bg-white text-zinc-900 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 hover:bg-emerald-500 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <Plus size={12} /> Place on Canvas
                    </button>
                    <button 
                      onClick={() => handleSmartCutout(asset.id)}
                      disabled={!!processingAssetId}
                      className="w-full bg-emerald-600 text-white py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      <Scissors size={12} /> Smart Cutout
                    </button>
                    <div className="grid grid-cols-2 gap-1 w-full">
                      <button 
                        onClick={() => handleGenerate3D(asset.id, "view from 45 degrees side")}
                        disabled={!!processingAssetId}
                        className="bg-blue-600 text-white py-1.5 rounded-lg text-[9px] font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        45° View
                      </button>
                      <button 
                        onClick={() => handleGenerate3D(asset.id, "top down view")}
                        disabled={!!processingAssetId}
                        className="bg-blue-600 text-white py-1.5 rounded-lg text-[9px] font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        Top View
                      </button>
                      <button 
                        onClick={() => handleGenerate3D(asset.id, "side profile view")}
                        disabled={!!processingAssetId}
                        className="bg-blue-600 text-white py-1.5 rounded-lg text-[9px] font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        Side View
                      </button>
                      <button 
                        onClick={() => {
                          const angle = window.prompt("Enter custom angle:", "isometric view");
                          if (angle) handleGenerate3D(asset.id, angle);
                        }}
                        disabled={!!processingAssetId}
                        className="bg-zinc-700 text-white py-1.5 rounded-lg text-[9px] font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50"
                      >
                        Custom
                      </button>
                    </div>
                    <button 
                      onClick={() => setAssets(assets.filter(a => a.id !== asset.id))}
                      disabled={!!processingAssetId}
                      className="absolute top-1 right-1 bg-white/20 backdrop-blur-md text-white p-1 rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {assets.length === 0 && (
                <div className="col-span-2 flex-1 flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-zinc-100 rounded-xl bg-zinc-50/50">
                  <Upload size={24} className="text-zinc-300 mb-2" />
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Drop images here</p>
                  <p className="text-[9px] text-zinc-300 mt-1">or click "Add Subject"</p>
                </div>
              )}
            </div>
          </section>

          {/* History Section */}
          <section className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
              <RefreshCcw size={14} /> History
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {historyList.map((url, idx) => (
                <button 
                  key={idx} 
                  onClick={() => setResultImage(url)}
                  className="flex-shrink-0 w-16 h-16 rounded-lg border border-zinc-100 overflow-hidden hover:border-emerald-500 transition-all"
                >
                  <img src={url} className="w-full h-full object-cover" />
                </button>
              ))}
              {historyList.length === 0 && (
                <p className="text-[10px] text-zinc-300 font-bold uppercase py-4 w-full text-center">No history</p>
              )}
            </div>
          </section>

          {/* Render Controls */}
          <section className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
              <Wand2 size={14} /> 3. Render
            </h2>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., 'Make it a cinematic movie poster with dramatic lighting'..."
              className="w-full h-24 bg-zinc-50 border border-zinc-100 rounded-xl p-3 text-xs focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none mb-4"
            />
            <button
              onClick={handleEdit}
              disabled={isProcessing || (!background && canvasElements.length === 0) || !prompt.trim()}
              className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
            >
              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
              {isProcessing ? 'Processing...' : 'Generate Studio Output'}
            </button>
          </section>
        </div>

        {/* Main Canvas Area */}
        <div className="lg:col-span-9 flex flex-col gap-6 min-h-0">
          <div className="flex-1 bg-white rounded-3xl border border-zinc-200 shadow-sm relative overflow-hidden flex flex-col">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2">
                <MousePointer2 size={16} className="text-zinc-400" />
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Studio Canvas</span>
              </div>
              <div className="flex items-center gap-4">
                {selectedId && (
                  <div className="flex items-center gap-2 border-r border-zinc-200 pr-4 mr-2">
                    <button 
                      onClick={() => moveElement('front')}
                      className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:bg-emerald-50 px-2 py-1 rounded"
                    >
                      Bring to Front
                    </button>
                    <button 
                      onClick={() => moveElement('back')}
                      className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:bg-zinc-100 px-2 py-1 rounded"
                    >
                      Send to Back
                    </button>
                    <button 
                      onClick={() => {
                        setCanvasElements(canvasElements.filter(e => e.id !== selectedId));
                        setSelectedId(null);
                      }}
                      className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:text-red-600 px-2 py-1 rounded"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">{Math.round(stageSize.width)}x{Math.round(stageSize.height)}px</span>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-8 bg-zinc-100/50 overflow-auto custom-scrollbar">
              <div className="bg-white shadow-2xl rounded-lg overflow-hidden border border-zinc-200 shrink-0">
                <Stage
                  width={stageSize.width}
                  height={stageSize.height}
                  ref={stageRef}
                  onMouseDown={(e) => {
                    const clickedOnEmpty = e.target === e.target.getStage();
                    if (clickedOnEmpty) setSelectedId(null);
                  }}
                >
                  <Layer>
                    {bgImage && (
                      <KonvaImage image={bgImage} width={stageSize.width} height={stageSize.height} listening={false} />
                    )}
                    {canvasElements.map((el, i) => {
                      const asset = assets.find(a => a.id === el.assetId);
                      if (!asset) return null;
                      return (
                        <DraggableImage
                          key={el.id}
                          element={el}
                          asset={asset}
                          isSelected={el.id === selectedId}
                          onSelect={() => setSelectedId(el.id)}
                          onChange={(newAttrs) => {
                            const els = canvasElements.slice();
                            els[i] = newAttrs;
                            setCanvasElements(els);
                          }}
                        />
                      );
                    })}
                  </Layer>
                </Stage>
              </div>
            </div>
          </div>

          {/* Result Drawer */}
          <AnimatePresence>
            {resultImage && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-white rounded-3xl border border-zinc-200 shadow-xl overflow-hidden"
              >
                <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-emerald-50/30">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Final Render</span>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setIsInpainting(true)}
                      className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:text-blue-700 flex items-center gap-1"
                    >
                      <Scissors size={12} /> Local Edit
                    </button>
                    <button 
                      onClick={() => {
                        const base64 = resultImage.split(',')[1];
                        setBackground({ ...background!, url: resultImage, base64, id: Math.random().toString(36).substr(2, 9) });
                        setResultImage(null);
                        setCanvasElements([]);
                      }}
                      className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-zinc-900 flex items-center gap-1"
                    >
                      <RefreshCcw size={12} /> Use as Base
                    </button>
                    <a href={resultImage} download="studio-render.png" className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:text-emerald-700 flex items-center gap-1">
                      <Download size={12} /> Save Image
                    </a>
                  </div>
                </div>
                <div className="p-6 flex justify-center bg-zinc-50">
                  <img src={resultImage} className="max-h-[400px] rounded-xl shadow-lg border border-zinc-200" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {error && (
        <div className="fixed bottom-6 right-6 z-[100]">
          <motion.div 
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3"
          >
            <X size={18} className="cursor-pointer" onClick={() => setError(null)} />
            <p className="text-sm font-bold">{error}</p>
          </motion.div>
        </div>
      )}

      {/* Inpainting Modal */}
      <AnimatePresence>
        {isInpainting && resultImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col h-[85vh]"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Local Inpainting</h2>
                  <p className="text-xs text-zinc-400 font-medium uppercase tracking-widest mt-1">Paint over the area you want to change</p>
                </div>
                <button onClick={() => setIsInpainting(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 flex overflow-hidden bg-zinc-100">
                <div className="w-64 border-r border-zinc-200 p-6 space-y-6 bg-white overflow-y-auto">
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">1. Instructions</p>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Use the brush to paint over the specific part of the image you want to modify.
                    </p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setInpaintLines(inpaintLines.slice(0, -1))}
                        disabled={inpaintLines.length === 0}
                        className="flex-1 bg-zinc-100 py-2 rounded-lg text-[10px] font-bold uppercase hover:bg-zinc-200 disabled:opacity-50"
                      >
                        Undo
                      </button>
                      <button 
                        onMouseDown={() => setShowInpaintOriginal(true)}
                        onMouseUp={() => setShowInpaintOriginal(false)}
                        onMouseLeave={() => setShowInpaintOriginal(false)}
                        className="flex-1 bg-zinc-100 py-2 rounded-lg text-[10px] font-bold uppercase hover:bg-zinc-200"
                      >
                        Compare
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">2. Modification Prompt</p>
                    <textarea 
                      value={inpaintPrompt}
                      onChange={(e) => setInpaintPrompt(e.target.value)}
                      placeholder="e.g., 'Change the sofa to a leather one'..."
                      className="w-full h-32 bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
                    />
                  </div>

                  <button 
                    onClick={() => setInpaintLines([])}
                    className="w-full py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-900 transition-colors"
                  >
                    Clear Mask
                  </button>
                </div>

                <div className="flex-1 flex items-center justify-center p-8 relative">
                  <div className="relative bg-white shadow-2xl rounded-lg overflow-hidden border border-zinc-300">
                    <img src={resultImage} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                    {showInpaintOriginal && (
                      <div className="absolute inset-0 z-50 bg-white">
                        <img src={resultImage} className="w-full h-full object-contain" />
                      </div>
                    )}
                    <Stage
                      width={800}
                      height={450}
                      ref={inpaintCanvasRef}
                      onMouseDown={(e) => {
                        const pos = e.target.getStage().getPointerPosition();
                        setInpaintLines([...inpaintLines, { points: [pos.x, pos.y] }]);
                        (e.target.getStage() as any).isDrawing = true;
                      }}
                      onMouseMove={(e) => {
                        const stage = e.target.getStage() as any;
                        if (!stage.isDrawing) return;
                        const pos = stage.getPointerPosition();
                        const lastLine = inpaintLines[inpaintLines.length - 1];
                        const newLines = [...inpaintLines];
                        newLines[inpaintLines.length - 1] = {
                          ...lastLine,
                          points: lastLine.points.concat([pos.x, pos.y])
                        };
                        setInpaintLines(newLines);
                      }}
                      onMouseUp={(e) => {
                        (e.target.getStage() as any).isDrawing = false;
                      }}
                    >
                      <Layer>
                        {inpaintLines.map((line, i) => (
                          <Line
                            key={i}
                            points={line.points}
                            stroke="#ff0000"
                            strokeWidth={20}
                            tension={0.5}
                            lineCap="round"
                            lineJoin="round"
                            opacity={0.5}
                          />
                        ))}
                      </Layer>
                    </Stage>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-200 bg-zinc-50 flex justify-end gap-3">
                <button onClick={() => setIsInpainting(false)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-100 transition-colors">
                  Cancel
                </button>
                <button 
                  onClick={handleInpaint}
                  disabled={isProcessing || !inpaintPrompt.trim()}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-600/20"
                >
                  {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                  Apply Local Edit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isRoomBuilderOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col h-[80vh]"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-900 text-white">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center text-[10px]">SU</div>
                    SketchUp Room Modeler
                  </h2>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Precision 3D Layout Tool</p>
                </div>
                <button onClick={() => setIsRoomBuilderOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Tools */}
                <div className="w-64 border-r border-zinc-200 p-4 space-y-6 bg-[#f0f0f0] overflow-y-auto">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">View Mode</p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setIsIsometric(false)} 
                        className={`flex-1 p-2 rounded text-[10px] font-bold border transition-all ${!isIsometric ? 'bg-zinc-800 text-white border-zinc-800' : 'bg-white text-zinc-600 border-zinc-300'}`}
                      >
                        Plan (2D)
                      </button>
                      <button 
                        onClick={() => setIsIsometric(true)} 
                        className={`flex-1 p-2 rounded text-[10px] font-bold border transition-all ${isIsometric ? 'bg-zinc-800 text-white border-zinc-800' : 'bg-white text-zinc-600 border-zinc-300'}`}
                      >
                        Iso (3D)
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Drawing Tools</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => addRoomElement('wall')} className="bg-white border border-zinc-300 p-2 rounded text-[10px] font-bold flex flex-col items-center gap-1 hover:border-blue-500 transition-all shadow-sm">
                        <div className="w-full h-1 bg-zinc-800 rounded" /> Wall (W)
                      </button>
                      <button onClick={() => addRoomElement('window')} className="bg-white border border-zinc-300 p-2 rounded text-[10px] font-bold flex flex-col items-center gap-1 hover:border-blue-500 transition-all shadow-sm">
                        <div className="w-full h-1 bg-blue-400 rounded" /> Window
                      </button>
                      <button onClick={() => addRoomElement('door')} className="bg-white border border-zinc-300 p-2 rounded text-[10px] font-bold flex flex-col items-center gap-1 hover:border-blue-500 transition-all shadow-sm">
                        <div className="w-full h-1 bg-amber-600 rounded" /> Door
                      </button>
                      <button onClick={() => addRoomElement('camera')} className="bg-white border border-zinc-300 p-2 rounded text-[10px] font-bold flex flex-col items-center gap-1 hover:border-red-500 transition-all shadow-sm">
                        <MousePointer2 size={14} className="text-red-600" /> Camera (C)
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Components</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => addRoomElement('bed')} className="bg-white border border-zinc-300 p-2 rounded text-[10px] font-bold flex flex-col items-center gap-1 hover:border-blue-500 transition-all shadow-sm">
                        <ImageIcon size={14} /> Bed
                      </button>
                      <button onClick={() => addRoomElement('sofa')} className="bg-white border border-zinc-300 p-2 rounded text-[10px] font-bold flex flex-col items-center gap-1 hover:border-blue-500 transition-all shadow-sm">
                        <ImageIcon size={14} /> Sofa
                      </button>
                      <button onClick={() => addRoomElement('table')} className="bg-white border border-zinc-300 p-2 rounded text-[10px] font-bold flex flex-col items-center gap-1 hover:border-blue-500 transition-all shadow-sm">
                        <ImageIcon size={14} /> Table
                      </button>
                      <button onClick={() => addRoomElement('cabinet')} className="bg-white border border-zinc-300 p-2 rounded text-[10px] font-bold flex flex-col items-center gap-1 hover:border-blue-500 transition-all shadow-sm">
                        <ImageIcon size={14} /> Cabinet
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Styles</p>
                    <select 
                      value={roomMaterial} 
                      onChange={(e) => setRoomMaterial(e.target.value)}
                      className="w-full bg-white border border-zinc-300 p-2 rounded text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option>Modern Minimalist</option>
                      <option>Industrial Loft</option>
                      <option>Scandinavian</option>
                      <option>Luxury Marble</option>
                      <option>Traditional Chinese</option>
                      <option>Bohemian</option>
                    </select>
                  </div>

                  {selectedRoomElId && (
                    <div className="pt-4 space-y-3 bg-white p-3 rounded-lg border border-zinc-200">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Entity Info</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-400">Rotation (°)</span>
                          <input 
                            type="number" 
                            value={roomElements.find(el => el.id === selectedRoomElId)?.rotation || 0}
                            onChange={(e) => {
                              setRoomElements(roomElements.map(el => el.id === selectedRoomElId ? { ...el, rotation: parseInt(e.target.value) || 0 } : el));
                            }}
                            className="w-20 border border-zinc-200 rounded px-1 py-0.5"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-400">Length (cm)</span>
                          <input 
                            type="number" 
                            value={roomElements.find(el => el.id === selectedRoomElId)?.width || 0}
                            onChange={(e) => {
                              setRoomElements(roomElements.map(el => el.id === selectedRoomElId ? { ...el, width: parseInt(e.target.value) || 0 } : el));
                            }}
                            className="w-20 border border-zinc-200 rounded px-1 py-0.5"
                          />
                        </div>
                        {['wall', 'window', 'door'].includes(roomElements.find(el => el.id === selectedRoomElId)?.type || '') && (
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-zinc-400">Thickness (cm)</span>
                            <input 
                              type="number" 
                              value={roomElements.find(el => el.id === selectedRoomElId)?.height || 0}
                              onChange={(e) => {
                                setRoomElements(roomElements.map(el => el.id === selectedRoomElId ? { ...el, height: parseInt(e.target.value) || 0 } : el));
                              }}
                              className="w-20 border border-zinc-200 rounded px-1 py-0.5"
                            />
                          </div>
                        )}
                        {roomElements.find(el => el.id === selectedRoomElId)?.type !== 'camera' && (
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-zinc-400">Height/Depth (cm)</span>
                            <input 
                              type="number" 
                              value={roomElements.find(el => el.id === selectedRoomElId)?.depth || 0}
                              onChange={(e) => {
                                setRoomElements(roomElements.map(el => el.id === selectedRoomElId ? { ...el, depth: parseInt(e.target.value) || 0 } : el));
                              }}
                              className="w-20 border border-zinc-200 rounded px-1 py-0.5"
                            />
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          setRoomElements(roomElements.filter(el => el.id !== selectedRoomElId));
                          setSelectedRoomElId(null);
                        }}
                        className="w-full bg-red-600 text-white p-2 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-red-700 transition-colors"
                      >
                        Delete Entity
                      </button>
                    </div>
                  )}
                </div>

                {/* Builder Canvas */}
                <div className="flex-1 bg-[#e8e8e8] flex items-center justify-center p-8 relative overflow-hidden">
                  {/* SU Axis Lines */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-red-400/30" /> {/* Red Axis */}
                    <div className="absolute top-0 left-1/2 w-[1px] h-full bg-green-400/30" /> {/* Green Axis */}
                  </div>

                  <div className="bg-white shadow-2xl rounded-sm overflow-hidden border border-zinc-400">
                    <Stage
                      width={600}
                      height={400}
                      ref={roomStageRef}
                      onMouseDown={(e) => {
                        if (e.target === e.target.getStage()) setSelectedRoomElId(null);
                      }}
                      scaleX={isIsometric ? 0.8 : 1}
                      scaleY={isIsometric ? 0.5 : 1}
                      rotation={isIsometric ? 45 : 0}
                      offsetX={isIsometric ? 300 : 0}
                      offsetY={isIsometric ? 200 : 0}
                      x={isIsometric ? 300 : 0}
                      y={isIsometric ? 200 : 0}
                    >
                      <Layer>
                        {/* Grid Background */}
                        {Array.from({ length: 25 }).map((_, i) => (
                          <Rect key={`h-${i}`} x={0} y={i * 25} width={600} height={0.5} fill="#ddd" listening={false} />
                        ))}
                        {Array.from({ length: 25 }).map((_, i) => (
                          <Rect key={`v-${i}`} x={i * 25} y={0} width={0.5} height={400} fill="#ddd" listening={false} />
                        ))}

                        {roomElements.map((el, i) => (
                          <React.Fragment key={el.id}>
                            {el.type === 'camera' ? (
                              <React.Fragment>
                                <Rect
                                  x={el.x}
                                  y={el.y}
                                  width={el.width}
                                  height={el.height}
                                  rotation={el.rotation}
                                  fill="#ef4444"
                                  draggable
                                  onClick={() => setSelectedRoomElId(el.id)}
                                  onDragEnd={(e) => {
                                    const newEls = [...roomElements];
                                    newEls[i] = { ...el, x: e.target.x(), y: e.target.y() };
                                    setRoomElements(newEls);
                                  }}
                                  stroke={selectedRoomElId === el.id ? '#000' : 'transparent'}
                                  strokeWidth={2}
                                  offsetX={el.width / 2}
                                  offsetY={el.height / 2}
                                />
                                <Rect
                                  x={el.x}
                                  y={el.y}
                                  width={100}
                                  height={60}
                                  rotation={el.rotation - 30}
                                  fill="rgba(239, 68, 68, 0.1)"
                                  listening={false}
                                  offsetX={0}
                                  offsetY={30}
                                />
                              </React.Fragment>
                            ) : (
                              <React.Fragment>
                                {/* Simulated 3D Extrusion */}
                                {isIsometric && (
                                  <Rect
                                    x={el.x}
                                    y={el.y}
                                    width={el.width}
                                    height={el.height}
                                    rotation={el.rotation}
                                    fill={
                                      el.type === 'wall' ? '#222' : 
                                      el.type === 'window' ? '#60a5fa' : 
                                      el.type === 'door' ? '#92400e' : 
                                      '#cbd5e1'
                                    }
                                    offsetY={el.depth ? el.depth / 5 : 20}
                                    listening={false}
                                  />
                                )}
                                <Rect
                                  x={el.x}
                                  y={el.y}
                                  width={el.width}
                                  height={el.height}
                                  rotation={el.rotation}
                                  fill={
                                    el.type === 'wall' ? '#444' : 
                                    el.type === 'window' ? '#93c5fd' : 
                                    el.type === 'door' ? '#d97706' : 
                                    '#f1f5f9'
                                  }
                                  draggable
                                  onClick={() => setSelectedRoomElId(el.id)}
                                  onDragEnd={(e) => {
                                    const newEls = [...roomElements];
                                    newEls[i] = { ...el, x: e.target.x(), y: e.target.y() };
                                    setRoomElements(newEls);
                                  }}
                                  stroke={selectedRoomElId === el.id ? '#2563eb' : '#94a3b8'}
                                  strokeWidth={1}
                                />
                                {selectedRoomElId === el.id && (
                                  <React.Fragment>
                                    <Text
                                      x={el.x + el.width / 2}
                                      y={el.y + el.height + 5}
                                      text={`${el.width}cm`}
                                      fontSize={8}
                                      fill="#2563eb"
                                      align="center"
                                    />
                                    <Text
                                      x={el.x + el.width + 5}
                                      y={el.y + el.height / 2}
                                      text={`${el.height}cm`}
                                      fontSize={8}
                                      fill="#2563eb"
                                      rotation={90}
                                    />
                                  </React.Fragment>
                                )}
                              </React.Fragment>
                            )}
                            <Text
                              x={el.x}
                              y={el.y - 12}
                              text={el.type.toUpperCase()}
                              fontSize={8}
                              fontStyle="bold"
                              fill="#64748b"
                              listening={false}
                            />
                          </React.Fragment>
                        ))}
                      </Layer>
                    </Stage>
                  </div>
                  <div className="absolute bottom-4 right-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500" /> X
                    <div className="w-2 h-2 bg-green-500" /> Y
                    <div className="w-2 h-2 bg-blue-500" /> Z
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-200 bg-white flex justify-between items-center">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  {roomElements.length} Entities in Model
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setIsRoomBuilderOpen(false)} className="px-6 py-2.5 rounded text-sm font-bold text-zinc-500 hover:bg-zinc-100 transition-colors">
                    Cancel
                  </button>
                  <button 
                    onClick={handleGenerateRoom}
                    disabled={isProcessing || roomElements.length === 0}
                    className="bg-red-600 text-white px-8 py-2.5 rounded text-sm font-bold flex items-center gap-2 hover:bg-red-700 disabled:opacity-50 transition-all shadow-lg shadow-red-600/20"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                    Render 3D Model
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
