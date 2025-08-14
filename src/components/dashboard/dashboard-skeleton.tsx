
import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-8 pt-6">
        <MainLayoutHeader>
            <Skeleton className="h-8 w-48" />
        </MainLayoutHeader>

        <div className="space-y-4">
          {/* KPIs Skeleton */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <Skeleton className="h-5 w-24" />
                 <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-4 w-40 mt-1" />
              </CardContent>
            </Card>
             <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <Skeleton className="h-5 w-24" />
                 <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-4 w-40 mt-1" />
              </CardContent>
            </Card>
             <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <Skeleton className="h-5 w-24" />
                 <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-4 w-24 mt-1" />
              </CardContent>
            </Card>
             <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <Skeleton className="h-5 w-24" />
                 <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-4 w-24 mt-1" />
              </CardContent>
            </Card>
             <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <Skeleton className="h-5 w-24" />
                 <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-4 w-24 mt-1" />
              </CardContent>
            </Card>
             <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <Skeleton className="h-5 w-24" />
                 <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-4 w-24 mt-1" />
              </CardContent>
            </Card>
          </div>

          {/* Charts Skeleton */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-1 lg:col-span-4">
                <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[300px] w-full" />
                </CardContent>
            </Card>
             <Card className="col-span-1 lg:col-span-3">
                <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[300px] w-full" />
                </CardContent>
            </Card>
            <Card className="col-span-1 lg:col-span-full">
                 <CardHeader>
                    <Skeleton className="h-6 w-1/4" />
                    <Skeleton className="h-4 w-1/3" />
                </CardHeader>
                <CardContent className="grid gap-8 md:grid-cols-2">
                     <Skeleton className="h-48 w-full" />
                     <Skeleton className="h-48 w-full" />
                </CardContent>
            </Card>
             <Card className="col-span-1 lg:col-span-full">
                <CardHeader>
                    <Skeleton className="h-6 w-1/4" />
                    <Skeleton className="h-4 w-1/3" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[300px] w-full" />
                </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
