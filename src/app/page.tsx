import { redirect } from 'next/navigation';
export default function Home() {
  redirect(
    process.env.DATABASE_URL
      ? '/admin'
      : process.env.NODE_ENV !== 'production'
        ? '/demo'
        : '/login',
  );
}
