import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ZONE_COLORS, ZONE_NAMES, STORE_NAMES, STORE_COLORS } from '@/lib/constants';
import { formatCurrency } from '@/lib/formatters';
import { motion } from 'framer-motion';
import { PieChart as PieChartIcon } from 'lucide-react';
import type { ZoneMixResponse } from '@/types';

interface Props {
  data: ZoneMixResponse;
}

/** Lighten a hex color by a given amount (0–1) */
function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Darken a hex color by blending toward black */
function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((num & 0xff) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function OuterTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-sm font-medium text-foreground">{data.name}</p>
      <p className="text-sm text-muted-foreground">{formatCurrency(data.value)}</p>
      <p className="text-xs text-muted-foreground">{data.mix.toFixed(1).replace('.', ',')}%</p>
    </div>
  );
}

function InnerTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-sm font-medium text-foreground">{data.storeName}</p>
      <p className="text-xs text-muted-foreground/70">{data.zoneName}</p>
      <p className="text-sm text-muted-foreground">{formatCurrency(data.value)}</p>
      <p className="text-xs text-muted-foreground">{data.mix.toFixed(1).replace('.', ',')}%</p>
    </div>
  );
}

/** Auto-detects whether the hovered segment is from the outer (zone) or inner (store) ring */
function DynamicTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  // Inner ring entries have storeName; outer ring entries have name (zone name)
  if (data.storeName) {
    return <InnerTooltip active={active} payload={payload} />;
  }
  return <OuterTooltip active={active} payload={payload} />;
}

export function ZoneMixChart({ data }: Props) {
  const zones = data.zones || [];
  const storeBreakdown = data.storeBreakdown || [];
  const hasStoreBreakdown = storeBreakdown.length > 0;

  const totalRevenue = zones.reduce((sum, d) => sum + d.total_revenue, 0);

  // Outer ring: zone totals
  const outerData = zones
    .filter((d) => d.total_revenue > 0)
    .map((d) => ({
      name: ZONE_NAMES[d.zone] || d.zone,
      zone: d.zone,
      value: d.total_revenue,
      mix: totalRevenue > 0 ? (d.total_revenue / totalRevenue) * 100 : 0,
      color: ZONE_COLORS[d.zone] || '#6b7280',
    }));

  // Inner ring: store breakdown per zone (only when "Todas as lojas")
  // IMPORTANT: must follow the same zone order as outerData so segments align
  const innerData = hasStoreBreakdown
    ? outerData.flatMap((outerEntry) => {
        return storeBreakdown
          .filter((d) => d.zone === outerEntry.zone && d.total_revenue > 0)
          .map((d) => {
            const zoneColor = ZONE_COLORS[d.zone] || '#6b7280';
            const storeIndex = Object.keys(STORE_NAMES).indexOf(d.store_id);
            const shade = storeIndex === 0
              ? darkenColor(zoneColor, 0.15)
              : lightenColor(zoneColor, 0.25);
            return {
              name: `${d.store_id}-${d.zone}`,
              storeName: STORE_NAMES[d.store_id] || d.store_id,
              zoneName: ZONE_NAMES[d.zone] || d.zone,
              zone: d.zone,
              store_id: d.store_id,
              value: d.total_revenue,
              mix: totalRevenue > 0 ? (d.total_revenue / totalRevenue) * 100 : 0,
              color: shade,
            };
          });
      })
    : [];

  if (outerData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-4">
          <PieChartIcon className="h-4 w-4 text-lupita-amber" />
          <h3 className="text-sm font-semibold text-foreground">Mix por Zona</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">
          Sem dados de zonas para o periodo selecionado
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <PieChartIcon className="h-4 w-4 text-lupita-amber" />
        <h3 className="text-sm font-semibold text-foreground">Mix por Zona</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          {/* Inner ring: store breakdown (only when Todas as lojas) */}
          {hasStoreBreakdown && innerData.length > 0 && (
            <Pie
              data={innerData}
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={72}
              paddingAngle={0}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
            >
              {innerData.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} stroke="none" />
              ))}
            </Pie>
          )}
          {/* Outer ring: zone totals */}
          <Pie
            data={outerData}
            cx="50%"
            cy="50%"
            innerRadius={hasStoreBreakdown ? 76 : 70}
            outerRadius={110}
            paddingAngle={0}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
          >
            {outerData.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<DynamicTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Zone legend */}
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {outerData.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-xs">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">
              {entry.name} ({entry.mix.toFixed(1).replace('.', ',')}%)
            </span>
          </div>
        ))}
      </div>

      {/* Store legend (when breakdown visible) */}
      {hasStoreBreakdown && (
        <div className="flex justify-center gap-4 mt-1.5">
          {Object.entries(STORE_NAMES).map(([storeId, name]) => (
            <div key={storeId} className="flex items-center gap-1.5 text-xs">
              <div
                className="w-2.5 h-2.5 rounded"
                style={{ backgroundColor: STORE_COLORS[storeId] || '#6b7280' }}
              />
              <span className="text-muted-foreground/70">{name}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
