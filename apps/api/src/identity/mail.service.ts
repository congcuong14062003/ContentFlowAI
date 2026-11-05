import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encryptMail } from '@contentflow/mail';
import type { Prisma } from '@prisma/client';

@Injectable()
export class MailService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  enqueue(tx: Prisma.TransactionClient, aggregateId: string, to: string, subject: string, text: string) {
    const payload = encryptMail({ to, subject, text }, this.config.getOrThrow<string>('MAIL_ENCRYPTION_KEY'));
    return tx.outboxEvent.create({ data: { aggregateId, topic: 'identity.email', payload: { ...payload } } });
  }
}
