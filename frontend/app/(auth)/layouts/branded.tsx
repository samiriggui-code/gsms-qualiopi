import { ReactNode } from 'react';
import { generalSettings } from '@/config/general.config';
import { toAbsoluteUrl } from '@/lib/helpers';
import { Card, CardContent } from '@/components/ui/card';

export function BrandedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid lg:grid-cols-2 grow">
      <div className="flex justify-center items-center p-8 lg:p-10 order-2 lg:order-1">
        <Card className="w-full max-w-[400px]">
          <CardContent className="p-6">{children}</CardContent>
        </Card>
      </div>

      <div
        className="lg:rounded-xl lg:border lg:border-border lg:m-5 order-1 lg:order-2 flex bg-zinc-950 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('${toAbsoluteUrl('/media/images/couv-dark.jpg')}')`,
        }}
      >
        <div className="flex flex-col justify-end grow p-8 lg:p-16">
          <div className="flex flex-col gap-3">
            <h3 className="text-2xl font-semibold text-white">
              {generalSettings.appName}
            </h3>
            <div className="text-base font-medium text-zinc-300">
              Pilotez la conformité Qualiopi de votre organisme :
              <br />
              <span className="text-white font-semibold">
                indicateurs, preuves, évaluations et audits
              </span>
              <br />
              au même endroit.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
