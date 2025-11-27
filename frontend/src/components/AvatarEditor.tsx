import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { X, ZoomIn, ZoomOut, Upload } from "lucide-react";
import { Button } from "@/components/ui";

type AvatarEditorProps = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (blob: Blob) => void;
    currentAvatarUrl?: string | null;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const CANVAS_SIZE = 400;
const OUTPUT_SIZE = 512;

export function AvatarEditor({ isOpen, onClose, onSave, currentAvatarUrl }: AvatarEditorProps) {
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [zoom, setZoom] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        setError(null);
        const file = acceptedFiles[0];

        if (!file) return;

        if (file.size > MAX_FILE_SIZE) {
            setError(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                setImage(img);
                setZoom(1);
                setPosition({ x: 0, y: 0 });
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "image/jpeg": [".jpg", ".jpeg"],
            "image/png": [".png"],
            "image/webp": [".webp"],
        },
        maxFiles: 1,
        multiple: false,
    });

    const drawCanvas = useCallback(() => {
        if (!image || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;

        // Clear canvas
        ctx.fillStyle = "#f3f4f6";
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // Calculate scaled dimensions
        const scale = zoom;
        const scaledWidth = image.width * scale;
        const scaledHeight = image.height * scale;

        // Draw image
        ctx.drawImage(
            image,
            position.x + (CANVAS_SIZE - scaledWidth) / 2,
            position.y + (CANVAS_SIZE - scaledHeight) / 2,
            scaledWidth,
            scaledHeight
        );

        // Draw circular crop overlay
        ctx.save();
        ctx.globalCompositeOperation = "destination-in";
        ctx.beginPath();
        ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }, [image, zoom, position]);

    useEffect(() => {
        drawCanvas();
    }, [drawCanvas]);

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y,
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleZoomIn = () => {
        setZoom((prev) => Math.min(prev + 0.1, 3));
    };

    const handleZoomOut = () => {
        setZoom((prev) => Math.max(prev - 0.1, 0.5));
    };

    const handleSave = () => {
        if (!image || !canvasRef.current) return;

        // Create output canvas
        const outputCanvas = document.createElement("canvas");
        outputCanvas.width = OUTPUT_SIZE;
        outputCanvas.height = OUTPUT_SIZE;
        const ctx = outputCanvas.getContext("2d");
        if (!ctx) return;

        // Calculate scaled dimensions for output
        const scale = zoom * (OUTPUT_SIZE / CANVAS_SIZE);
        const scaledWidth = image.width * scale;
        const scaledHeight = image.height * scale;
        const offsetX = (position.x * OUTPUT_SIZE) / CANVAS_SIZE;
        const offsetY = (position.y * OUTPUT_SIZE) / CANVAS_SIZE;

        // Draw image on output canvas
        ctx.drawImage(
            image,
            offsetX + (OUTPUT_SIZE - scaledWidth) / 2,
            offsetY + (OUTPUT_SIZE - scaledHeight) / 2,
            scaledWidth,
            scaledHeight
        );

        // Apply circular mask
        ctx.globalCompositeOperation = "destination-in";
        ctx.beginPath();
        ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();

        // Convert to blob
        outputCanvas.toBlob((blob) => {
            if (blob) {
                onSave(blob);
                handleClose();
            }
        }, "image/jpeg", 0.9);
    };

    const handleClose = () => {
        setImage(null);
        setZoom(1);
        setPosition({ x: 0, y: 0 });
        setError(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                        <div>
                            <h2 className="text-lg font-semibold">Edit Avatar</h2>
                            <p className="text-xs text-mute">Upload and crop your profile photo</p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="h-10 w-10 flex items-center justify-center rounded-xl border border-border hover:bg-accent/10 transition"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto flex-1">
                        {!image ? (
                            <div
                                {...getRootProps()}
                                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition ${isDragActive
                                    ? "border-accent bg-accent/5"
                                    : "border-border hover:border-accent/50 hover:bg-accent/5"
                                    }`}
                            >
                                <input {...getInputProps()} />
                                <div className="flex flex-col items-center gap-4">
                                    <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center">
                                        <Upload className="h-8 w-8 text-accent" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">
                                            {isDragActive ? "Drop your image here" : "Drag & drop an image, or click to browse"}
                                        </p>
                                        <p className="text-xs text-mute mt-1">PNG, JPG or WEBP up to <span className="font-semibold text-ink">5MB</span></p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-center">
                                    <div className="relative">
                                        <canvas
                                            ref={canvasRef}
                                            className="rounded-full border-4 border-border shadow-lg cursor-move"
                                            style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
                                            onMouseDown={handleMouseDown}
                                            onMouseMove={handleMouseMove}
                                            onMouseUp={handleMouseUp}
                                            onMouseLeave={handleMouseUp}
                                        />
                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-card border border-border rounded-full px-4 py-2 shadow-lg flex items-center gap-3">
                                            <button
                                                onClick={handleZoomOut}
                                                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent/10 transition"
                                                disabled={zoom <= 0.5}
                                            >
                                                <ZoomOut size={16} />
                                            </button>
                                            <span className="text-xs font-medium min-w-[3rem] text-center">
                                                {Math.round(zoom * 100)}%
                                            </span>
                                            <button
                                                onClick={handleZoomIn}
                                                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent/10 transition"
                                                disabled={zoom >= 3}
                                            >
                                                <ZoomIn size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs text-mute text-center">Drag to reposition • Use zoom controls to adjust size</p>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-card/50 shrink-0">
                        {image && (
                            <Button variant="ghost" onClick={() => setImage(null)}>
                                Choose different image
                            </Button>
                        )}
                        <div className="flex items-center gap-2 ml-auto">
                            <Button variant="ghost" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={!image}>
                                Save avatar
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
