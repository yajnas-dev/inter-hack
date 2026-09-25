import { Eye, EyeOff, Globe } from 'lucide-react';
import { motion, useAnimation, useInView, useMotionTemplate, useMotionValue } from 'motion/react';
import { type ChangeEvent, type FormEvent, forwardRef, memo, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Adapted from the "modern animated sign-in" block for this Vite app: no next/image (icons come from
// lucide-react), no Google button unless a handler is passed, labelled controls, and Tailwind classes
// limited to what Tailwind v3 supports.

// ==================== Input Component ====================

const Input = memo(
  forwardRef(function Input(
    { className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>,
    ref: React.ForwardedRef<HTMLInputElement>
  ) {
    const radius = 100; // radius of the hover glow
    const [visible, setVisible] = useState(false);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent<HTMLDivElement>) {
      const { left, top } = currentTarget.getBoundingClientRect();
      mouseX.set(clientX - left);
      mouseY.set(clientY - top);
    }

    const glow = useMotionTemplate`radial-gradient(${visible ? `${radius}px` : '0px'} circle at ${mouseX}px ${mouseY}px, var(--brand), transparent 80%)`;

    return (
      <motion.div
        style={{ background: glow }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="group/input rounded-lg p-[2px] transition duration-300"
      >
        <input
          type={type}
          className={cn(
            'shadow-input flex h-10 w-full rounded-md border-none bg-gray-50 px-3 py-2 text-sm text-black transition duration-[400ms] group-hover/input:shadow-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-neutral-500 focus-visible:ring-[2px] focus-visible:ring-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800 dark:text-white dark:placeholder:text-neutral-400 dark:shadow-[0px_0px_1px_1px_#404040] dark:focus-visible:ring-neutral-400',
            className
          )}
          ref={ref}
          {...props}
        />
      </motion.div>
    );
  })
);

Input.displayName = 'Input';

// ==================== BoxReveal Component ====================

type BoxRevealProps = {
  children: ReactNode;
  width?: string;
  boxColor?: string;
  duration?: number;
  overflow?: string;
  position?: string;
  className?: string;
};

const BoxReveal = memo(function BoxReveal({
  children,
  width = 'fit-content',
  boxColor,
  duration,
  overflow = 'hidden',
  position = 'relative',
  className
}: BoxRevealProps) {
  const mainControls = useAnimation();
  const slideControls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      slideControls.start('visible');
      mainControls.start('visible');
    } else {
      slideControls.start('hidden');
      mainControls.start('hidden');
    }
  }, [isInView, mainControls, slideControls]);

  return (
    <section
      ref={ref}
      style={{ position: position as 'relative' | 'absolute' | 'fixed' | 'sticky' | 'static', width, overflow }}
      className={className}
    >
      <motion.div
        variants={{ hidden: { opacity: 0, y: 75 }, visible: { opacity: 1, y: 0 } }}
        initial="hidden"
        animate={mainControls}
        transition={{ duration: duration ?? 0.5, delay: 0.25 }}
      >
        {children}
      </motion.div>
      <motion.div
        aria-hidden="true"
        variants={{ hidden: { left: 0 }, visible: { left: '100%' } }}
        initial="hidden"
        animate={slideControls}
        transition={{ duration: duration ?? 0.5, ease: 'easeIn' }}
        style={{
          position: 'absolute',
          top: 4,
          bottom: 4,
          left: 0,
          right: 0,
          zIndex: 20,
          background: boxColor ?? '#5046e6',
          borderRadius: 4
        }}
      />
    </section>
  );
});

// ==================== Ripple Component ====================

type RippleProps = {
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
  className?: string;
};

const Ripple = memo(function Ripple({ mainCircleSize = 210, mainCircleOpacity = 0.24, numCircles = 11, className = '' }: RippleProps) {
  return (
    <section
      className={`absolute inset-0 flex items-center justify-center bg-neutral-50 dark:bg-white/5 [mask-image:linear-gradient(to_bottom,black,transparent)] dark:[mask-image:linear-gradient(to_bottom,white,transparent)] ${className}`}
    >
      {Array.from({ length: numCircles }, (_, i) => {
        const size = mainCircleSize + i * 70;
        const opacity = mainCircleOpacity - i * 0.03;
        const borderOpacity = 5 + i * 5;

        return (
          <span
            key={size}
            className="absolute animate-ripple rounded-full border bg-foreground/15"
            style={
              {
                width: `${size}px`,
                height: `${size}px`,
                opacity,
                '--i': i * 0.3,
                borderStyle: i === numCircles - 1 ? 'dashed' : 'solid',
                borderWidth: '1px',
                borderColor: `hsl(var(--foreground) / ${borderOpacity / 100})`,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)'
              } as React.CSSProperties
            }
          />
        );
      })}
    </section>
  );
});

// ==================== OrbitingCircles Component ====================

type OrbitingCirclesProps = {
  className?: string;
  children: ReactNode;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
};

const OrbitingCircles = memo(function OrbitingCircles({
  className,
  children,
  reverse = false,
  duration = 20,
  delay = 10,
  radius = 50,
  path = true
}: OrbitingCirclesProps) {
  return (
    <>
      {path && (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" version="1.1" className="pointer-events-none absolute inset-0 size-full">
          <circle className="stroke-black/10 stroke-1 dark:stroke-white/10" cx="50%" cy="50%" r={radius} fill="none" />
        </svg>
      )}
      <section
        style={{ '--duration': duration, '--radius': radius, '--delay': -delay } as React.CSSProperties}
        className={cn(
          'absolute flex size-full transform-gpu animate-orbit items-center justify-center rounded-full border bg-black/10 [animation-delay:calc(var(--delay)*1000ms)] dark:bg-white/10',
          { '[animation-direction:reverse]': reverse },
          className
        )}
      >
        {children}
      </section>
    </>
  );
});

// ==================== TechOrbitDisplay Component ====================

type IconConfig = {
  className?: string;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
  reverse?: boolean;
  component: () => React.ReactNode;
};

type TechnologyOrbitDisplayProps = {
  iconsArray: IconConfig[];
  text?: string;
};

const TechOrbitDisplay = memo(function TechOrbitDisplay({ iconsArray, text = 'Animated Login' }: TechnologyOrbitDisplayProps) {
  return (
    <section className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg">
      <span className="pointer-events-none whitespace-pre-wrap bg-gradient-to-b from-black to-gray-300/80 bg-clip-text text-center text-7xl font-semibold leading-none text-transparent dark:from-white dark:to-slate-900/10">
        {text}
      </span>

      {iconsArray.map((icon) => (
        <OrbitingCircles
          key={`${icon.radius}-${icon.delay}-${icon.className}`}
          className={icon.className}
          duration={icon.duration}
          delay={icon.delay}
          radius={icon.radius}
          path={icon.path}
          reverse={icon.reverse}
        >
          {icon.component()}
        </OrbitingCircles>
      ))}
    </section>
  );
});

// ==================== AnimatedForm Component ====================

type FieldType = 'text' | 'email' | 'password';

type Field = {
  label: string;
  /** Form control name; defaults to a slug of the label. */
  name?: string;
  required?: boolean;
  type: FieldType;
  placeholder?: string;
  autoComplete?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

type AnimatedFormProps = {
  header: string;
  subHeader?: string;
  fields: Field[];
  submitButton: string;
  textVariantButton?: string;
  errorField?: string;
  fieldPerRow?: number;
  /** Shown above the fields, for controls the block does not model (for example a role picker). */
  extra?: ReactNode;
  minPasswordLength?: number;
  submitting?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  googleLogin?: string;
  onGoogleLogin?: () => void;
  goTo?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

type Errors = Record<string, string>;

const slug = (label: string) => label.toLowerCase().replace(/\W+/g, '-');
const COLUMNS: Record<number, string> = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3' };
const BOX = 'hsl(var(--skeleton))';

const AnimatedForm = memo(function AnimatedForm({
  header,
  subHeader,
  fields,
  submitButton,
  textVariantButton,
  errorField,
  fieldPerRow = 1,
  extra,
  minPasswordLength = 6,
  submitting,
  onSubmit,
  googleLogin,
  onGoogleLogin,
  goTo
}: AnimatedFormProps) {
  const uid = useId();
  const [visible, setVisible] = useState<boolean>(false);
  const [errors, setErrors] = useState<Errors>({});

  const nameOf = (field: Field) => field.name ?? slug(field.label);

  const validateForm = (form: HTMLFormElement) => {
    const currentErrors: Errors = {};
    const data = new FormData(form);
    for (const field of fields) {
      const value = String(data.get(nameOf(field)) ?? '');

      if (field.required && !value) {
        currentErrors[nameOf(field)] = `${field.label} is required`;
      } else if (field.type === 'email' && value && !/\S+@\S+\.\S+/.test(value)) {
        currentErrors[nameOf(field)] = 'Enter a valid email address';
      } else if (field.type === 'password' && value && value.length < minPasswordLength) {
        currentErrors[nameOf(field)] = `Password must be at least ${minPasswordLength} characters long`;
      }
    }
    return currentErrors;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formErrors = validateForm(event.currentTarget);
    setErrors(formErrors);
    if (Object.keys(formErrors).length === 0) onSubmit(event);
  };

  return (
    <section className="mx-auto flex w-96 flex-col gap-4 max-md:w-full">
      <BoxReveal boxColor={BOX} duration={0.3}>
        <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-200">{header}</h1>
      </BoxReveal>

      {subHeader && (
        <BoxReveal boxColor={BOX} duration={0.3} className="pb-2">
          <p className="max-w-sm text-sm text-neutral-600 dark:text-neutral-300">{subHeader}</p>
        </BoxReveal>
      )}

      {googleLogin && onGoogleLogin && (
        <>
          <BoxReveal boxColor={BOX} duration={0.3} overflow="visible" width="unset">
            <button
              className="group/btn h-10 w-full rounded-md border bg-transparent font-medium outline-none hover:cursor-pointer"
              type="button"
              onClick={onGoogleLogin}
            >
              <span className="flex h-full w-full items-center justify-center gap-3">
                <Globe className="h-5 w-5" aria-hidden="true" />
                {googleLogin}
              </span>
              <BottomGradient />
            </button>
          </BoxReveal>

          <BoxReveal boxColor={BOX} duration={0.3} width="100%">
            <section className="flex items-center gap-4">
              <hr className="flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-700" />
              <p className="text-sm text-neutral-700 dark:text-neutral-300">or</p>
              <hr className="flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-700" />
            </section>
          </BoxReveal>
        </>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {extra && (
          <BoxReveal boxColor={BOX} duration={0.3} width="100%" className="mb-4">
            {extra}
          </BoxReveal>
        )}
        <section className={`mb-4 grid grid-cols-1 ${COLUMNS[fieldPerRow] ?? 'md:grid-cols-1'}`}>
          {fields.map((field) => {
            const name = nameOf(field);
            const id = `${uid}-${name}`;
            const error = errors[name];
            return (
              <section key={name} className="flex flex-col gap-2">
                <BoxReveal boxColor={BOX} duration={0.3}>
                  <Label htmlFor={id}>
                    {field.label}
                    {field.required && (
                      <span className="text-red-600 dark:text-red-400" aria-hidden="true">
                        {' '}
                        *
                      </span>
                    )}
                  </Label>
                </BoxReveal>

                <BoxReveal width="100%" boxColor={BOX} duration={0.3} className="flex w-full flex-col space-y-2">
                  <section className="relative">
                    <Input
                      type={field.type === 'password' ? (visible ? 'text' : 'password') : field.type}
                      id={id}
                      name={name}
                      placeholder={field.placeholder}
                      autoComplete={field.autoComplete}
                      required={field.required}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${id}-error` : undefined}
                      onChange={field.onChange}
                    />

                    {field.type === 'password' && (
                      <button
                        type="button"
                        onClick={() => setVisible(!visible)}
                        aria-label={visible ? 'Hide password' : 'Show password'}
                        aria-pressed={visible}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm leading-5 text-neutral-700 dark:text-neutral-300"
                      >
                        {visible ? <Eye className="h-5 w-5" aria-hidden="true" /> : <EyeOff className="h-5 w-5" aria-hidden="true" />}
                      </button>
                    )}
                  </section>

                  <section className="min-h-4">
                    {error && (
                      <p id={`${id}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
                        {error}
                      </p>
                    )}
                  </section>
                </BoxReveal>
              </section>
            );
          })}
        </section>

        {errorField && (
          <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
            {errorField}
          </p>
        )}

        <BoxReveal width="100%" boxColor={BOX} duration={0.3} overflow="visible">
          <button
            className="group/btn relative block h-10 w-full rounded-md bg-gradient-to-br from-zinc-200 to-zinc-200 font-medium text-black shadow-[0px_1px_0px_0px_#ffffff40_inset,0px_-1px_0px_0px_#ffffff40_inset] outline-none hover:cursor-pointer disabled:opacity-60 dark:bg-zinc-800 dark:from-zinc-900 dark:to-zinc-900 dark:text-white dark:shadow-[0px_1px_0px_0px_#27272a_inset,0px_-1px_0px_0px_#27272a_inset]"
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitButton} &rarr;
            <BottomGradient />
          </button>
        </BoxReveal>

        {textVariantButton && goTo && (
          <BoxReveal boxColor={BOX} duration={0.3}>
            <section className="mt-4 text-center">
              <button
                type="button"
                className="text-sm text-blue-700 underline-offset-2 outline-none hover:underline focus-visible:underline dark:text-blue-400"
                onClick={goTo}
              >
                {textVariantButton}
              </button>
            </section>
          </BoxReveal>
        )}
      </form>
    </section>
  );
});

const BottomGradient = () => {
  return (
    <>
      <span className="absolute inset-x-0 -bottom-px block h-px w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 transition duration-500 group-hover/btn:opacity-100" />
      <span className="absolute inset-x-10 -bottom-px mx-auto block h-px w-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-0 blur-sm transition duration-500 group-hover/btn:opacity-100" />
    </>
  );
};

// ==================== AuthTabs Component ====================

interface AuthTabsProps {
  formFields: Omit<AnimatedFormProps, 'onSubmit' | 'goTo' | 'googleLogin' | 'onGoogleLogin'>;
  goTo?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  googleLogin?: string;
  onGoogleLogin?: () => void;
}

const AuthTabs = memo(function AuthTabs({ formFields, goTo, handleSubmit, googleLogin, onGoogleLogin }: AuthTabsProps) {
  return (
    <div className="flex w-full flex-col items-center justify-center">
      <AnimatedForm {...formFields} onSubmit={handleSubmit} goTo={goTo} googleLogin={googleLogin} onGoogleLogin={onGoogleLogin} />
    </div>
  );
});

// ==================== Label Component ====================

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  htmlFor?: string;
}

const Label = memo(function Label({ className, ...props }: LabelProps) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is passed through props by every caller
    <label
      className={cn(
        'text-sm font-medium leading-none text-neutral-800 dark:text-neutral-200 peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    />
  );
});

// ==================== Exports ====================

export { Input, BoxReveal, Ripple, OrbitingCircles, TechOrbitDisplay, AnimatedForm, AuthTabs, Label, BottomGradient };
