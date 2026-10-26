import { Field, ObjectType } from '@nestjs/graphql';

import { IsIn, IsNotEmpty } from 'class-validator';
import { type FormSubmissionsConfiguration } from 'twenty-shared/types';

import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';

@ObjectType('FormSubmissionsConfiguration')
export class FormSubmissionsConfigurationDTO
  implements FormSubmissionsConfiguration
{
  @Field(() => WidgetConfigurationType)
  @IsIn([WidgetConfigurationType.FORM_SUBMISSIONS])
  @IsNotEmpty()
  configurationType: WidgetConfigurationType.FORM_SUBMISSIONS;
}
