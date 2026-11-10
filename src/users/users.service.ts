import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { CacheInvalidationService } from '../common/cache';
import { CloudinaryService, deleteImageQuietly } from '../common/cloudinary';
import { UserType } from '../common/enums';
import { ErrorCode } from '../common/errors';
import { Paginated, resolveSort, toSkip } from '../common/pagination';
import { ListUsersQueryDto } from './dtos/list-users-query.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { User } from './users.entity';

const USER_SORT_FIELDS = ['createdAt', 'email', 'username'] as const;

export interface CreateUserData {
  email: string;
  username?: string;
  password: string;
}

export interface GoogleUserData {
  googleId: string;
  email: string;
  username: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly dataSource: DataSource,
    private readonly auditLogs: AuditLogsService,
    private readonly cache: CacheInvalidationService,
  ) {}

  // Lookups

  /**
   * @param id User ID
   * @returns The user, or `null` if there is no such user
   */
  public findById(id: string): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  /**
   * @param id User ID
   * @returns The user
   * @throws NotFoundException If there is no such user
   */
  public async getById(id: string): Promise<User> {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: `User with id ${id} not found`,
      });
    }

    return user;
  }

  public findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneBy({ email });
  }

  public findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepository.findOneBy({ googleId });
  }

  /**
   * The password hash is `select: false`, so the places that need it (login,
   * change password) ask for it explicitly, and nothing else does.
   * @returns The user's id, password hash (`null` for Google-only accounts)
   * and verification state, or `null` if the email is not registered
   */
  public findCredentialsByEmail(
    email: string,
  ): Promise<Pick<User, 'id' | 'password' | 'isAccountVerified'> | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.password', 'user.isAccountVerified'])
      .where('user.email = :email', { email })
      .getOne();
  }

  public findCredentialsById(
    id: string,
  ): Promise<Pick<User, 'id' | 'password'> | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.password'])
      .where('user.id = :id', { id })
      .getOne();
  }

  /**
   * Get All Users (Admin): filter, sort and paginate
   * @returns A page of users and the total
   */
  public async getAllUser(query: ListUsersQueryDto): Promise<Paginated<User>> {
    const { sortBy, sortOrder } = resolveSort(
      query,
      USER_SORT_FIELDS,
      'createdAt',
    );

    const [data, total] = await this.userRepository.findAndCount({
      where: query.userType ? { userType: query.userType } : {},
      order: { [sortBy]: sortOrder, id: sortOrder },
      skip: toSkip(query),
      take: query.limit,
    });

    return Paginated.of(data, total, query);
  }

  // Account creation (used by the auth module)

  /**
   * Create a user with a password. The email must be verified afterwards.
   * @param data Email, optional username and the password HASH
   */
  public create(data: CreateUserData): Promise<User> {
    return this.userRepository.save(this.userRepository.create(data));
  }

  /**
   * Create a user from a Google profile (Google verified the email already)
   */
  public createFromGoogle(data: GoogleUserData): Promise<User> {
    return this.userRepository.save(
      this.userRepository.create({ ...data, isAccountVerified: true }),
    );
  }

  /**
   * Link a Google account to an existing user.
   * If the email was never verified, the person who owns the Google account
   * is now the proven owner of the email, so the password someone set while
   * registering with it is removed (it could belong to an impostor).
   */
  public async linkGoogleAccount(user: User, googleId: string): Promise<User> {
    user.googleId = googleId;

    if (!user.isAccountVerified) {
      user.isAccountVerified = true;
      user.password = null;
    }

    return this.userRepository.save(user);
  }

  public async makeEmailVerified(id: string): Promise<void> {
    await this.userRepository.update({ id }, { isAccountVerified: true });
  }

  public async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.userRepository.update({ id }, { password: passwordHash });
  }

  // User

  /**
   * Update User
   * @param user The logged in user
   * @param dto Data From Update User
   * @returns Updated User
   */
  public async updateUser(user: User, dto: UpdateUserDto): Promise<User> {
    user.username = dto.username ?? user.username;

    return this.userRepository.save(user);
  }

  /**
   * Delete User
   * @param userId User to delete
   * @param actor The logged in user (the same user, or an admin)
   * @param ip IP address of the request, for the audit log
   * @returns Delete Message
   */
  public async deleteUser(userId: string, actor: User, ip?: string) {
    if (userId !== actor.id && actor.userType !== UserType.ADMIN) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Access Denied, You Are Not Allowed',
      });
    }

    const user = await this.getById(userId);

    await this.dataSource.transaction(async (manager) => {
      await this.auditLogs.record(manager, {
        userId: actor.id,
        action: AuditAction.USER_DELETED,
        entity: 'User',
        entityId: userId,
        metadata: { email: user.email, selfDelete: userId === actor.id },
        ipAddress: ip,
      });

      await manager.remove(User, user);
    });
    await this.cache.invalidateDashboard();

    if (user.profileImagePublicId) {
      await deleteImageQuietly(
        this.cloudinaryService,
        user.profileImagePublicId,
        this.logger,
      );
    }

    return {
      message: 'User Deleted Successfully',
    };
  }

  // Profile Image

  /**
   * Upload Profile Image
   * @param user The logged in user
   * @param file Profile Image
   * @returns Updated User
   */
  public async uploadProfileImage(
    user: User,
    file: Express.Multer.File,
  ): Promise<User> {
    const oldPublicId = user.profileImagePublicId;

    const { url, publicId } = await this.cloudinaryService.uploadImage(file);

    user.profileImage = url;
    user.profileImagePublicId = publicId;

    let saved: User;
    try {
      saved = await this.userRepository.save(user);
    } catch (error) {
      await deleteImageQuietly(this.cloudinaryService, publicId, this.logger);
      throw error;
    }

    if (oldPublicId) {
      await deleteImageQuietly(
        this.cloudinaryService,
        oldPublicId,
        this.logger,
      );
    }

    return saved;
  }

  /**
   * Remove Profile Image
   * @param user The logged in user
   * @returns Updated User
   */
  public async removeProfileImage(user: User): Promise<User> {
    if (!user.profileImagePublicId) {
      throw new BadRequestException({
        code: ErrorCode.NO_PROFILE_IMAGE,
        message: 'No Profile Image Found',
      });
    }

    await this.cloudinaryService.deleteImage(user.profileImagePublicId);

    user.profileImage = null;
    user.profileImagePublicId = null;

    return this.userRepository.save(user);
  }
}
