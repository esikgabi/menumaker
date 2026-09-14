import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { assertMockAuthSafe } from '@/lib/auth-guard';

assertMockAuthSafe({
  enableMockAuth: process.env.ENABLE_MOCK_AUTH === 'true',
  nodeEnv: process.env.NODE_ENV,
});

const providers: NextAuthOptions['providers'] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  }),
];

export async function upsertDevUser(input: { email: string; name?: string | null }) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: { name: input.name || undefined },
    create: {
      email: input.email,
      name: input.name || input.email,
    },
  });
}

if (process.env.ENABLE_MOCK_AUTH === 'true') {
  providers.push(
    CredentialsProvider({
      id: 'dev-login',
      name: 'Dev Login',
      credentials: {
        name: { label: 'Name', type: 'text' },
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        const user = await upsertDevUser({ email: credentials.email, name: credentials.name });
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  session: {
    // Credentials provider requires JWT sessions; using jwt for both
    // providers keeps behavior consistent regardless of which one signed in.
    strategy: 'jwt',
  },
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        await prisma.user.upsert({
          where: { email: user.email },
          update: { googleId: account.providerAccountId || undefined },
          create: {
            email: user.email,
            name: user.name || user.email,
            googleId: account.providerAccountId || undefined,
          },
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        const dbUser = await prisma.user.findUnique({ where: { id: token.sub } });
        if (dbUser) {
          session.user.householdId = dbUser.householdId;
          session.user.locale = dbUser.locale;
        }
      }
      return session;
    },
  },
};
