import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import './ChromaGrid.css';

export interface ChromaGridItem {
    image: string;
    title: string;
    subtitle: string;
    handle?: string;
    borderColor?: string;
    gradient?: string;
    url?: string;
    location?: string;
    age?: number | string;
    email?: string;
    status?: string;
    [key: string]: any;
}

interface ChromaGridProps {
    items: ChromaGridItem[];
    className?: string;
    radius?: number;
    columns?: number;
    rows?: number;
    damping?: number;
    fadeOut?: number;
    ease?: string;
    onItemClick?: (item: ChromaGridItem) => void;
}

export const ChromaGrid = ({
    items,
    className = '',
    radius = 300,
    columns = 3,
    rows = 2,
    damping = 0.45,
    fadeOut = 0.6,
    ease = 'power3.out',
    onItemClick
}: ChromaGridProps) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const fadeRef = useRef<HTMLDivElement>(null);
    const setX = useRef<((val: any) => void) | null>(null);
    const setY = useRef<((val: any) => void) | null>(null);
    const pos = useRef({ x: 0, y: 0 });

    const data = items;

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        setX.current = gsap.quickSetter(el, '--x', 'px') as (val: any) => void;
        setY.current = gsap.quickSetter(el, '--y', 'px') as (val: any) => void;
        const { width, height } = el.getBoundingClientRect();
        pos.current = { x: width / 2, y: height / 2 };
        if (setX.current) setX.current(pos.current.x);
        if (setY.current) setY.current(pos.current.y);
    }, []);

    const moveTo = (x: number, y: number) => {
        gsap.to(pos.current, {
            x,
            y,
            duration: damping,
            ease,
            onUpdate: () => {
                setX.current?.(pos.current.x);
                setY.current?.(pos.current.y);
            },
            overwrite: true
        });
    };

    const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!rootRef.current) return;
        const r = rootRef.current.getBoundingClientRect();
        moveTo(e.clientX - r.left, e.clientY - r.top);
        gsap.to(fadeRef.current, { opacity: 0, duration: 0.25, overwrite: true });
    };

    const handleLeave = () => {
        gsap.to(fadeRef.current, {
            opacity: 1,
            duration: fadeOut,
            overwrite: true
        });
    };

    const handleCardClick = (e: React.MouseEvent, item: ChromaGridItem) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (onItemClick) {
                // Special signal for selection toggle
                onItemClick({ ...item, _isSelectionToggle: true });
            }
            return;
        }

        if (onItemClick) {
            onItemClick(item);
        } else if (item.url) {
            window.open(item.url, '_blank', 'noopener,noreferrer');
        }
    };

    const handleCardMove = (e: React.MouseEvent<HTMLElement>) => {
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
    };

    return (
        <div
            ref={rootRef}
            className={`chroma-grid ${className}`}
            style={{
                '--r': `${radius}px`,
                '--cols': columns,
                '--rows': rows
            } as React.CSSProperties}
            onPointerMove={handleMove}
            onPointerLeave={handleLeave}
        >
            {data.map((c, i) => (
                <article
                    key={i}
                    className={`chroma-card ${c.selected ? 'selected' : ''}`}
                    onMouseMove={handleCardMove}
                    onClick={(e) => handleCardClick(e, c)}
                    style={{
                        '--card-border': c.borderColor || 'transparent',
                        '--card-gradient': c.gradient,
                        cursor: (c.url || onItemClick) ? 'pointer' : 'default'
                    } as React.CSSProperties}
                >
                    <div className="chroma-img-wrapper">
                        <img src={c.image} alt={c.title} loading="lazy" />
                    </div>

                    {c.actions && c.actions.length > 0 && (
                        <div className="chroma-actions">
                            {c.actions.map((action: any, idx: number) => (
                                <button
                                    key={idx}
                                    className="chroma-action-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        action.onClick();
                                    }}
                                    title={action.label}
                                >
                                    {action.icon}
                                </button>
                            ))}
                        </div>
                    )}

                    <footer className="chroma-info">
                        <div className="chroma-header">
                            <h3 className="name">{c.title}</h3>
                            {c.status && <span className="status-tag" data-status={c.status}>{c.status}</span>}
                        </div>
                        <div className="chroma-details">
                            {c.age && <span className="detail-item">Age: {c.age}</span>}
                            {c.email && <span className="detail-item email" title={c.email}>{c.email}</span>}
                        </div>
                        <p className="role">{c.subtitle}</p>
                        {c.location && <span className="location">{c.location}</span>}
                    </footer>
                </article>
            ))}
            <div className="chroma-overlay" />
            <div ref={fadeRef} className="chroma-fade" />
        </div>
    );
};

export default ChromaGrid;
