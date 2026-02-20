import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { pt } from 'react-day-picker/locale';
import { format, parse, isValid } from 'date-fns';
import 'react-day-picker/style.css';

interface DatePickerProps {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  className?: string;
}

export function DatePicker({ value, onChange, className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const date = parse(value, 'yyyy-MM-dd', new Date());
  const displayValue = isValid(date) ? format(date, 'dd/MM/yyyy') : value;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-left min-w-[120px]"
      >
        {displayValue}
      </button>

      {open && (
        <div className="absolute top-10 left-0 z-50 rounded-lg border border-border bg-card shadow-xl p-2">
          <DayPicker
            mode="single"
            selected={isValid(date) ? date : undefined}
            onSelect={(day) => {
              if (day) {
                onChange(format(day, 'yyyy-MM-dd'));
                setOpen(false);
              }
            }}
            defaultMonth={isValid(date) ? date : new Date()}
            locale={pt}
            weekStartsOn={1}
            showWeekNumber
            classNames={{
              root: 'lupita-calendar',
              month_caption: 'text-sm font-semibold text-foreground flex justify-center py-1 capitalize',
              weekdays: 'text-[11px] text-muted-foreground',
              weekday: 'w-9 text-center font-medium',
              week: 'text-sm',
              week_number: 'text-[10px] text-muted-foreground/60 w-7 text-center font-mono',
              day: 'w-9 h-9 text-center text-sm rounded-md hover:bg-lupita-amber/20 transition-colors cursor-pointer',
              day_button: 'w-full h-full flex items-center justify-center rounded-md',
              selected: 'bg-lupita-amber text-white font-semibold hover:bg-lupita-amber',
              today: 'font-bold text-lupita-amber',
              outside: 'text-muted-foreground/40',
              nav: 'flex items-center justify-between px-1',
              button_previous: 'h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground',
              button_next: 'h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground',
              caption_label: 'text-sm font-semibold capitalize',
            }}
          />
        </div>
      )}
    </div>
  );
}
