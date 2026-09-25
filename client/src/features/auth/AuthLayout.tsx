import { Award, Bell, Briefcase, Building2, FileText, MapPin, Search, Send, Users } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { Ripple, TechOrbitDisplay } from '@/components/ui/modern-animated-sign-in';

const icon = (Icon: typeof Briefcase, size: number) => () => (
  <Icon className="size-full text-blue-700 dark:text-blue-400" strokeWidth={1.5} style={{ padding: size > 30 ? 8 : 4 }} />
);

/** Jobs-themed icons orbiting the wordmark (stand-ins for the original technology logos). */
const ORBIT = [
  { component: icon(Search, 30), className: 'size-[30px] border-none bg-transparent', duration: 20, delay: 20, radius: 100, path: false },
  { component: icon(MapPin, 30), className: 'size-[30px] border-none bg-transparent', duration: 20, delay: 10, radius: 100, path: false },
  { component: icon(Briefcase, 50), className: 'size-[50px] border-none bg-transparent', radius: 210, duration: 20, path: false },
  { component: icon(FileText, 50), className: 'size-[50px] border-none bg-transparent', radius: 210, duration: 20, delay: 20, path: false },
  {
    component: icon(Send, 30),
    className: 'size-[30px] border-none bg-transparent',
    duration: 20,
    delay: 20,
    radius: 150,
    path: false,
    reverse: true
  },
  {
    component: icon(Bell, 30),
    className: 'size-[30px] border-none bg-transparent',
    duration: 20,
    delay: 10,
    radius: 150,
    path: false,
    reverse: true
  },
  {
    component: icon(Users, 50),
    className: 'size-[50px] border-none bg-transparent',
    radius: 270,
    duration: 20,
    path: false,
    reverse: true
  },
  {
    component: icon(Award, 50),
    className: 'size-[50px] border-none bg-transparent',
    radius: 270,
    duration: 20,
    delay: 60,
    path: false,
    reverse: true
  },
  { component: icon(Building2, 50), className: 'size-[50px] border-none bg-transparent', radius: 320, duration: 20, delay: 20, path: false }
];

/** Split screen for sign-in and registration: decorative animation on the left, the form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <section className="anim-auth flex min-h-[calc(100dvh-var(--header-h))] max-lg:justify-center">
        <div aria-hidden="true" className="relative flex w-1/2 flex-col justify-center overflow-hidden max-lg:hidden">
          <Ripple mainCircleSize={100} className="max-w-full" />
          <TechOrbitDisplay iconsArray={ORBIT} text="Job Portal" />
        </div>
        <div className="flex w-1/2 flex-col items-center justify-center px-6 py-10 max-lg:w-full max-lg:px-[10%]">{children}</div>
      </section>
    </MotionConfig>
  );
}
