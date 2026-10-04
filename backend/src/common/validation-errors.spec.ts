import type { ValidationError } from 'class-validator';
import { brokenRules, validationFailed } from './validation-errors.js';

describe('brokenRules', () => {
  it('names the field and the rule of a plain field', () => {
    const errors: ValidationError[] = [
      {
        property: 'password',
        constraints: {
          minLength: 'password must be longer than or equal to 8 characters',
        },
      },
    ];

    expect(brokenRules(errors)).toEqual([
      {
        field: 'password',
        code: 'minLength',
        message: 'password must be longer than or equal to 8 characters',
      },
    ]);
  });

  it('gives one entry per rule when a field breaks two', () => {
    const errors: ValidationError[] = [
      {
        property: 'email',
        constraints: {
          maxLength: 'email must be shorter than or equal to 254 characters',
          isEmail: 'email must be an email',
        },
      },
    ];

    expect(brokenRules(errors).map(({ field, code }) => [field, code])).toEqual(
      [
        ['email', 'maxLength'],
        ['email', 'isEmail'],
      ],
    );
  });

  it('builds the path of a field inside a list', () => {
    // How class-validator reports the note of the first pick: the list,
    // then the position, then the field.
    const errors: ValidationError[] = [
      {
        property: 'values',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'note',
                constraints: {
                  maxLength:
                    'note must be shorter than or equal to 300 characters',
                },
              },
            ],
          },
        ],
      },
    ];

    expect(brokenRules(errors)).toEqual([
      {
        field: 'values.0.note',
        code: 'maxLength',
        message:
          'values.0.note must be shorter than or equal to 300 characters',
      },
    ]);
  });

  it('reports an unknown field as whitelistValidation', () => {
    const errors: ValidationError[] = [
      {
        property: 'isAdmin',
        constraints: {
          whitelistValidation: 'property isAdmin should not exist',
        },
      },
    ];

    expect(brokenRules(errors)).toEqual([
      {
        field: 'isAdmin',
        code: 'whitelistValidation',
        message: 'property isAdmin should not exist',
      },
    ]);
  });

  it('keeps the rule of a list when one of its items is wrong too', () => {
    const errors: ValidationError[] = [
      {
        property: 'values',
        constraints: { arrayUnique: 'Each value can be picked only once.' },
        children: [
          {
            property: '1',
            children: [
              {
                property: 'value',
                constraints: { isIn: 'value must be one of the following' },
              },
            ],
          },
        ],
      },
    ];

    expect(brokenRules(errors).map(({ field, code }) => [field, code])).toEqual(
      [
        ['values', 'arrayUnique'],
        ['values.1.value', 'isIn'],
      ],
    );
  });

  it('returns nothing for no errors', () => {
    expect(brokenRules([])).toEqual([]);
  });
});

describe('validationFailed', () => {
  it('answers 400 with the sentences and the codes side by side', () => {
    const error = validationFailed([
      {
        property: 'password',
        constraints: {
          minLength: 'password must be longer than or equal to 8 characters',
        },
      },
    ]);

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      code: 'validation.failed',
      message: ['password must be longer than or equal to 8 characters'],
      errors: [{ field: 'password', code: 'minLength' }],
    });
  });
});
