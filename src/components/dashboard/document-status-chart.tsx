'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useState } from 'react';

type ChartData = {
  name: string;
  value: number;
};

const COLORS = [
  'hsl(var(--chart-1))', 
  'hsl(var(--chart-2))', 
  'hsl(var(--vat-other))', 
  'hsl(var(--chart-4))', 
  'hsl(var(--chart-5))'
];

const HOVER_COLORS = [
  'hsl(142 76% 36%)',  // Verde más brillante
  'hsl(221 83% 53%)',  // Azul más brillante
  'hsl(262 83% 58%)',  // Violeta más brillante
  'hsl(346 77% 50%)',  // Rojo más brillante
  'hsl(48 96% 53%)',   // Amarillo más brillante
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-lg border bg-background p-2 sm:p-2.5 shadow-lg shadow-primary/20 animate-in fade-in zoom-in duration-200">
        <p className="font-bold text-xs sm:text-sm bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
          {data.name}
        </p>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Documentos: <span className="tabular-nums font-semibold text-foreground">{data.value}</span>
        </p>
      </div>
    );
  }
  return null;
};

export function DocumentStatusChart({ data }: { data: ChartData[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  
  const totalDocuments = data.reduce((acc, curr) => acc + curr.value, 0);

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
    setIsHovering(true);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
    setIsHovering(false);
  };

  return (
    <Card className="overflow-hidden hover:shadow-xl hover:shadow-primary/10 hover:scale-[1.02] transition-all duration-300 group">
      {/* 📱 HEADER RESPONSIVE */}
      <CardHeader className="px-3 py-3 sm:px-4 lg:px-6 sm:py-4">
        <CardTitle className="text-base sm:text-lg lg:text-xl group-hover:text-primary transition-colors duration-300">
          Distribución de Documentos
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm group-hover:text-foreground/70 transition-colors duration-300">
          Proporción de cada tipo de documento. 
          <span className="block sm:inline sm:ml-1">
            Total: <span className="font-medium tabular-nums text-primary">{totalDocuments}</span>.
          </span>
        </CardDescription>
      </CardHeader>
      
      {/* 📱 CONTENT RESPONSIVE */}
      <CardContent className="px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4">
        {data.length > 0 ? (
          <div className={`transition-transform duration-300 ${isHovering ? 'scale-105' : 'scale-100'}`}>
            <ResponsiveContainer width="100%" height={250} className="sm:h-[280px] lg:h-[300px]">
              <PieChart>
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  iconType="circle" 
                  wrapperStyle={{ 
                    fontSize: '12px',
                    paddingTop: '10px'
                  }}
                  className="text-xs sm:text-sm"
                />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={window.innerWidth < 640 ? 70 : window.innerWidth < 1024 ? 85 : 100}
                  innerRadius={window.innerWidth < 640 ? 45 : window.innerWidth < 1024 ? 55 : 60}
                  paddingAngle={3}
                  fill="hsl(var(--primary))"
                  labelLine={false}
                  onMouseEnter={onPieEnter}
                  onMouseLeave={onPieLeave}
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={activeIndex === index ? HOVER_COLORS[index % HOVER_COLORS.length] : COLORS[index % COLORS.length]}
                      className="stroke-background cursor-pointer transition-all duration-300"
                      strokeWidth={activeIndex === index ? 3 : 2}
                      style={{
                        filter: activeIndex === index ? 'drop-shadow(0 0 8px rgba(0,0,0,0.3))' : 'none',
                        transform: activeIndex === index ? 'scale(1.05)' : 'scale(1)',
                        transformOrigin: 'center',
                      }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          // 📱 EMPTY STATE RESPONSIVE CON ANIMACIÓN
          <div className="flex h-[250px] sm:h-[280px] lg:h-[300px] w-full items-center justify-center text-muted-foreground px-4">
            <div className="text-center animate-pulse">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-full bg-muted animate-bounce" style={{ animationDuration: '2s' }}>
                <div className="w-full h-full rounded-full border-4 border-dashed border-muted-foreground/20" />
              </div>
              <p className="text-sm sm:text-base font-medium">No hay datos de documentos</p>
              <p className="text-xs sm:text-sm mt-1">Cuando agregues documentos, aparecerán aquí</p>
            </div>
          </div>
        )}
      </CardContent>

      <style jsx global>{`
        @keyframes pop-in {
          0% {
            transform: scale(0.8);
            opacity: 0;
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .recharts-pie-sector {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .recharts-pie-sector:hover {
          filter: brightness(1.2) drop-shadow(0 4px 12px rgba(0,0,0,0.3));
        }
      `}</style>
    </Card>
  );
}