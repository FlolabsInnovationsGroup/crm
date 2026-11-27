import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('AgreementPreview')
export class AgreementPreviewDTO {
  @Field(() => String, { nullable: true })
  templateName: string | null;

  @Field(() => String)
  text: string;

  @Field(() => [String])
  missingPlaceholders: string[];
}
