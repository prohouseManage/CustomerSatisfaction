'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';

export default function StarRating({
  name,
  value,
  required,
  onChange,
  language = 'fr',
}: {
  name: string;
  value?: number;
  required: boolean;
  onChange: (value: number) => void;
  language?: 'fr' | 'en' | 'de';
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className="star-rating" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4].map((n) => (
        <label
          key={n}
          className={n <= (hovered ?? value ?? 0) ? 'filled' : ''}
          onMouseEnter={() => setHovered(n)}
        >
          <input
            type="radio"
            name={name}
            value={n}
            aria-label={
              language === 'en'
                ? `${n} star${n > 1 ? 's' : ''} out of 4`
                : language === 'de'
                  ? `${n} Stern${n > 1 ? 'e' : ''} von 4`
                  : `${n} étoile${n > 1 ? 's' : ''} sur 4`
            }
            checked={value === n}
            required={required}
            onChange={() => onChange(n)}
          />
          <Star
            size={34}
            strokeWidth={1.6}
            aria-hidden="true"
            fill={n <= (hovered ?? value ?? 0) ? 'currentColor' : 'none'}
          />
        </label>
      ))}
    </div>
  );
}
