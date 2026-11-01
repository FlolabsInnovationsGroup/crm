import { Field, ObjectType } from '@nestjs/graphql';

import { ConnectedAccountPublicDTO } from 'src/engine/metadata-modules/connected-account/dtos/connected-account-public.dto';

@ObjectType('SenderConnectedAccount')
export class SenderConnectedAccountDTO extends ConnectedAccountPublicDTO {
  // Lets a reply find its mailbox from the thread's message channel.
  @Field(() => [String])
  messageChannelIds: string[];
}
