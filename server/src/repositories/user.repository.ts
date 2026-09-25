import type { ClientSession, FilterQuery } from 'mongoose';
import type { AdminUserListQuery, Role } from '@jobportal/shared';
import { User, type UserAttrs } from '../models';
import { escapeRegex } from '../utils/escapeRegex';
import { skipFor } from '../utils/pagination';

export type UserRow = Omit<UserAttrs, 'password'>;

export const findById = (id: string) => User.findById(id).lean<UserRow>();

/** Just what the auth middleware needs for every request (cached there). */
export const findAuthState = (id: string) => User.findById(id).select('isActive sessionsValidAfter').lean();

export const findByEmailWithPassword = (email: string) => User.findOne({ email }).select('+password').lean();

export const findPasswordHash = async (id: string): Promise<string | undefined> =>
  (await User.findById(id).select('+password').lean())?.password;

export const existsByEmail = async (email: string): Promise<boolean> => Boolean(await User.exists({ email }));

export async function create(
  attrs: { name: string; email: string; password: string; role: Role },
  session?: ClientSession
): Promise<UserRow> {
  const [created] = await User.create([attrs], { session });
  const { password: _password, ...row } = created!.toObject();
  return row;
}

export const update = (
  id: string,
  set: Partial<Pick<UserAttrs, 'name' | 'isActive' | 'password' | 'sessionsValidAfter' | 'lastLoginAt'>>
) => User.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true }).lean<UserRow>();

export async function list(query: AdminUserListQuery): Promise<[UserRow[], number]> {
  const filter: FilterQuery<UserAttrs> = {};
  if (query.role) filter.role = query.role;
  if (query.isActive !== undefined) filter.isActive = query.isActive;
  if (query.q) {
    const prefix = new RegExp(`^${escapeRegex(query.q)}`, 'i');
    filter.$or = [{ name: prefix }, { email: prefix }];
  }
  return Promise.all([
    User.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skipFor(query)).limit(query.limit).lean<UserRow[]>(),
    User.countDocuments(filter)
  ]);
}

export const deleteById = (id: string, session?: ClientSession) => User.deleteOne({ _id: id }, { session });
