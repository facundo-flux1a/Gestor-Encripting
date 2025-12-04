import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <MainLayout>
      {/* 📱 CONTENEDOR PRINCIPAL CON PADDING RESPONSIVE */}
      <div className="flex-1 space-y-3 sm:space-y-4 p-3 sm:p-4 lg:p-6 xl:p-8 pt-4 sm:pt-6">
        <MainLayoutHeader>
          <Skeleton className="h-6 sm:h-7 lg:h-8 w-32 sm:w-40 lg:w-48" />
        </MainLayoutHeader>

        <div className="space-y-3 sm:space-y-4">
          {/* 📱 KPIs SKELETON - GRID RESPONSIVE */}
          <div className="grid gap-2 sm:gap-3 lg:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2">
                  <Skeleton className="h-4 sm:h-5 w-16 sm:w-20 lg:w-24" />
                  <Skeleton className="h-3 w-3 sm:h-4 sm:w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-5 sm:h-6 lg:h-7 w-20 sm:w-24 lg:w-32" />
                  <Skeleton className="h-3 sm:h-4 w-24 sm:w-32 lg:w-40 mt-1" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 📱 CHARTS SKELETON - GRID RESPONSIVE */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-7">
            {/* Chart principal */}
            <Card className="col-span-1 lg:col-span-4">
              <CardHeader>
                <Skeleton className="h-5 sm:h-6 w-3/4" />
                <Skeleton className="h-3 sm:h-4 w-1/2 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 sm:h-64 lg:h-[300px] w-full" />
              </CardContent>
            </Card>
            
            {/* Chart secundario */}
            <Card className="col-span-1 lg:col-span-3">
              <CardHeader>
                <Skeleton className="h-5 sm:h-6 w-3/4" />
                <Skeleton className="h-3 sm:h-4 w-1/2 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 sm:h-64 lg:h-[300px] w-full" />
              </CardContent>
            </Card>
            
            {/* Dos gráficos lado a lado */}
            <Card className="col-span-1 lg:col-span-full">
              <CardHeader>
                <Skeleton className="h-5 sm:h-6 w-1/4" />
                <Skeleton className="h-3 sm:h-4 w-1/3 mt-1" />
              </CardHeader>
              <CardContent className="grid gap-4 sm:gap-6 lg:gap-8 grid-cols-1 md:grid-cols-2">
                <Skeleton className="h-32 sm:h-40 lg:h-48 w-full" />
                <Skeleton className="h-32 sm:h-40 lg:h-48 w-full" />
              </CardContent>
            </Card>
            
            {/* Chart full width */}
            <Card className="col-span-1 lg:col-span-full">
              <CardHeader>
                <Skeleton className="h-5 sm:h-6 w-1/4" />
                <Skeleton className="h-3 sm:h-4 w-1/3 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 sm:h-64 lg:h-[300px] w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}