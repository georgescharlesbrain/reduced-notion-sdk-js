// Find the official Notion API client @ https://  github.com/makenotion/notion-sdk-js/
// npm install @notionhq/client
import { Client } from "@notionhq/client"
import {
  // Error codes
  NotionErrorCode,
  APIErrorCode,
  ClientErrorCode,
  // Error types
  NotionClientError,
  APIResponseError,
  UnknownHTTPResponseError,
  RequestTimeoutError,
  // Error helpers
  isNotionClientError,

  // helper functions
  collectPaginatedAPI,
  iteratePaginatedAPI,
  isFullBlock,
  isFullDatabase,
  isFullPage,
  isFullUser,
  isFullComment,
} from "@notionhq/client/build/src/index"

import {
  assertNever
} from "@notionhq/client/build/src/utils"

import {
  TextRichTextItemResponse,
  DatabaseObjectResponse,
  PropertyItemObjectResponse,
  RichTextPropertyItemObjectResponse,
  RichTextItemResponse,
  // TextRichTextItemResponse,
  GetDatabaseParameters,
  GetDatabaseResponse,
  getDatabase,
  QueryDatabaseParameters,
  QueryDatabaseResponse,
  queryDatabase,
  CreateDatabaseParameters,
  CreateDatabaseResponse,
  createDatabase,
  UpdateDatabaseParameters,
  UpdateDatabaseResponse,
  updateDatabase,
  CreatePageParameters,
  CreatePageResponse,
  createPage,
  GetPageParameters,
  GetPageResponse,
  getPage,
  UpdatePageParameters,
  UpdatePageResponse,
  updatePage,
  GetPagePropertyParameters,
  GetPagePropertyResponse,
  getPageProperty,
} from "@notionhq/client/build/src/api-endpoints"

import * as _ from "lodash"

import dotenv from "dotenv"
import path from "path"
dotenv.config({ path: path.resolve(__dirname, ".env") })
import * as faker from "faker"
import { uniqueId, update } from "lodash"

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  // auth is still required if pages and databases are public
})
const pageIdBase = process.env.BASE_PARENT_PAGE_ID as string

const startTime = new Date()
startTime.setSeconds(0, 0)

// throw new Error("End of script");

// _____helper functions_____

// Given the properties of a database, generate an object full of
// random data that can be used to generate new rows in our Notion database.
function makeFakePropertiesData(
  properties: GetDatabaseResponse["properties"]
): Record<string, CreatePageParameters["properties"]> {
  const propertyValues: Record<string, CreatePageParameters["properties"]> = {}
  Object.entries(properties).forEach(([name, property]) => {
    if (property.type === "date") {
      propertyValues[name] = {
        type: "date",
        date: {
          start: faker.date.past().toISOString(),
        },
      }
    } else if (property.type === "multi_select") {
      const multiSelectOption = _.sample(property.multi_select.options)
      if (multiSelectOption) {
        propertyValues[name] = {
          type: "multi_select",
          multi_select: [multiSelectOption],
        }
      }
    } else if (property.type === "select") {
      const selectOption = _.sample(property.select.options)
      if (selectOption) {
        propertyValues[name] = {
          type: "select",
          id: property.id,
          select: selectOption,
        }
      }
    } else if (property.type === "email") {
      propertyValues[name] = {
        type: "email",
        id: property.id,
        email: faker.internet.email(),
      }
    } else if (property.type === "checkbox") {
      propertyValues[name] = {
        type: "checkbox",
        id: property.id,
        checkbox: faker.datatype.boolean(),
      }
    } else if (property.type === "url") {
      propertyValues[name] = {
        type: "url",
        id: property.id,
        url: faker.internet.url(),
      }
    } else if (property.type === "number") {
      propertyValues[name] = {
        type: "number",
        id: property.id,
        number: faker.datatype.number(),
      }
    } else if (property.type === "title") {
      propertyValues[name] = {
        type: "title",
        id: property.id,
        title: [
          {
            type: "text",
            text: { content: faker.lorem.words(3) },
          },
        ],
      }
    } else if (property.type === "rich_text") {
      propertyValues[name] = {
        type: "rich_text",
        id: property.id,
        rich_text: [
          {
            type: "text",
            text: { content: faker.name.firstName() },
          },
        ],
      }
    } else if (property.type === "phone_number") {
      propertyValues[name] = {
        type: "phone_number",
        id: property.id,
        phone_number: faker.phone.phoneNumber(),
      }
    } else {
      console.log("unimplemented property type: ", property.type)
    }
  })
  return propertyValues
}

/* not required anymore create the properties object directly
function makeDatabaseProperties(
  propertiesInput: Array<{ name: string; type: string; options?: object }>
): CreateDatabaseParameters["properties"] {
  const databasePropertySchema: CreateDatabaseParameters["properties"] = {} //Record<string, object> = {}
  propertiesInput.forEach(col => {
    if (col.type === "date") {
      databasePropertySchema[col.name] = {
        date: {},
      }
    } else if (col.type === "multi_select") {
      // TODO: add options
      databasePropertySchema[col.name] = {
        multi_select: {},
      }
    } else if (col.type === "select") {
      databasePropertySchema[col.name] = {
        // TODO: add options
        select: {},
      }
    } else if (col.type === "email") {
      databasePropertySchema[col.name] = {
        email: {},
      }
    } else if (col.type === "checkbox") {
      databasePropertySchema[col.name] = {
        checkbox: {},
      }
    } else if (col.type === "url") {
      databasePropertySchema[col.name] = {
        url: {},
      }
    } else if (col.type === "number") {
      databasePropertySchema[col.name] = {
        number: { format: "number" }, //TODO make it possible to pass a NumberFormat
      }
    } else if (col.type === "title") {
      databasePropertySchema[col.name] = {
        title: {},
      }
    } else if (col.type === "rich_text") {
      databasePropertySchema[col.name] = {
        rich_text: {},
      }
    } else if (col.type === "phone_number") {
      databasePropertySchema[col.name] = {
        phone_number: {},
      }
    } else {
      console.log("unimplemented property type: ", col.type)
    }
  })
  return databasePropertySchema
}
*/

function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here")
}

function userToString(userBase: { id: string; name?: string | null }) {
  return `${userBase.id}: ${userBase.name || "Unknown Name"}`
}

function findRandomSelectColumnNameAndValue(
  properties: GetDatabaseResponse["properties"]
): {
  name: string
  value: string | undefined
} {
  const options = _.flatMap(Object.entries(properties), ([name, property]) => {
    if (property.type === "select") {
      return [
        { name, value: _.sample(property.select.options.map(o => o.name)) },
      ]
    }
    return []
  })

  if (options.length > 0) {
    return _.sample(options) || { name: "", value: undefined }
  }

  return { name: "", value: undefined }
}

function extractPropertyItemValueToString(
  property: Extract<GetPagePropertyResponse, { object: "property_item" }>
): string {
  switch (property.type) {
    case "checkbox":
      return property.checkbox.toString()
    case "created_by":
      return userToString(property.created_by)
    case "created_time":
      return new Date(property.created_time).toISOString()
    case "date":
      return property.date ? new Date(property.date.start).toISOString() : ""
    case "email":
      return property.email ?? ""
    case "url":
      return property.url ?? ""
    case "number":
      return typeof property.number === "number"
        ? property.number.toString()
        : ""
    case "phone_number":
      return property.phone_number ?? ""
    case "select":
      if (!property.select) {
        return ""
      }
      return `${property.select.id} ${property.select.name}`
    case "multi_select":
      if (!property.multi_select) {
        return ""
      }
      return property.multi_select
        .map(select => `${select.id} ${select.name}`)
        .join(", ")
    case "people":
      return userToString(property.people)
    case "last_edited_by":
      return userToString(property.last_edited_by)
    case "last_edited_time":
      return new Date(property.last_edited_time).toISOString()
    case "title":
      return property.title.plain_text
    case "rich_text":
      return property.rich_text.plain_text
    case "files":
      return property.files.map(file => file.name).join(", ")
    case "formula":
      if (property.formula.type === "string") {
        return property.formula.string || "???"
      } else if (property.formula.type === "number") {
        return property.formula.number?.toString() || "???"
      } else if (property.formula.type === "boolean") {
        return property.formula.boolean?.toString() || "???"
      } else if (property.formula.type === "date") {
        return (
          (property.formula.date?.start &&
            new Date(property.formula.date.start).toISOString()) ||
          "???"
        )
      } else {
        return assertUnreachable(property.formula)
      }
    case "rollup":
      if (property.rollup.type === "number") {
        return property.rollup.number?.toString() || "???"
      } else if (property.rollup.type === "date") {
        return (
          (property.rollup.date?.start &&
            new Date(property.rollup.date?.start).toISOString()) ||
          "???"
        )
      } else if (property.rollup.type === "array") {
        return JSON.stringify(property.rollup.array)
      } else if (
        property.rollup.type === "incomplete" ||
        property.rollup.type === "unsupported"
      ) {
        return property.rollup.type
      } else {
        return assertUnreachable(property.rollup)
      }
    case "relation":
      if (property.relation) {
        return property.relation.id
      }
      return "???"
    case "status":
      return property.status?.name ?? ""
  }
  return assertUnreachable(property)
}

function extractValueToString(property: GetPagePropertyResponse): string {
  if (property.object === "property_item") {
    return extractPropertyItemValueToString(property)
  } else if (property.object === "list") {
    return property.results
      .map(result => extractPropertyItemValueToString(result))
      .join(", ")
  } else {
    return assertUnreachable(property)
  }
}

// _____Database communication functions_____

// Use interface to introduce named parameters for a function
interface TestCreateDatabaseInterface {
  pageId?: string
  title: string
  description?: string
  archived?: boolean
  properties?: CreateDatabaseParameters["properties"]
}

function longest<Type extends { length: number }>(a: Type, b: Type) {
  if (a.length >= b.length) {
    return a;
  } else {
    return b;
  }
}


async function testCreateDatabase({
  pageId = pageIdBase,
  title,
  description = "", // default value
  archived = false,
  properties = {
    "default title col": {
      title: {},
    },
  },
}: TestCreateDatabaseInterface): Promise<DatabaseObjectResponse> {
  console.log("\n\n********* Create Database *********\n\n")

  // TODO how easily create rich_text objects by just giving plain_text

  const parameters: CreateDatabaseParameters = {
    parent: { page_id: pageId },
    title: [{ text: { content: title } }],
    // description: [{ type: "text", text: { content: description } }],
    // description: [{ text: { content: description } } as RichTextItemResponse],
    // description[0]["text"]["content"] = description,
    description: [{ text: { content: description } }],
    archived: archived,
    properties: properties,
  } as CreateDatabaseParameters

  const database = (await notion.databases.create(
    parameters
  )) as DatabaseObjectResponse

  console.log(
    `Created database with id ${database.id} and title ${database.title[0].plain_text}`
  )
  return database
}

async function testCreatePage(
  databaseId: string,
  properties: GetDatabaseResponse["properties"]
): Promise<void> {
  console.log("\n\n********* Create Page *********\n\n")

  const RowsToWrite = 1

  // generate a bunch of fake pages with fake data
  for (let i = 0; i < RowsToWrite; i++) {
    const propertiesData = makeFakePropertiesData(properties)

    const parameters: CreatePageParameters = {
      parent: {
        database_id: databaseId,
      },
      properties: propertiesData,
    } as CreatePageParameters

    console.log(
      `__CreatePageParameters__\n  ${parameters} and ${typeof parameters}}`
    )
    console.log(parameters)

    /*
      __CreatePageParameters__ from SUI DatabasePropertySchema in SUI database | OK

      __CreatePageParameters__ from SUI DatabasePropertySchema in NEW database on base_parent_page in notion | OK

            [object Object] and object}
            {
              parent: { database_id: '97c23281-6140-44e6-bb0c-22fdb43af3e1' },
              properties: {
                tag: { type: 'multi_select', multi_select: [Array] },
                email: { type: 'email', id: 'MiQG', email: 'Lisa_Fisher64@yahoo.com' },
                'start date': { type: 'date', date: [Object] },
                rating: { type: 'number', id: 'icqW', number: 5578 },
                'dev status': { type: 'select', id: 'lUbB', select: [Object] },
                description: { type: 'rich_text', id: 'qJfN', rich_text: [Array] },
                'twitter url': { type: 'url', id: 'uFuQ', url: 'http://kevon.name' },
                'project name': { type: 'title', id: 'title', title: [Array] }
              }
            }
            
      __CreatePageParameters__ from NEW DatabasePropertySchema in NEW database on base_parent_page in notion | TODO

    */

    await notion.pages.create(parameters)
  }

  console.log(
    `Wrote ${RowsToWrite} rows after ${startTime} in database ${databaseId}`
  )
}

async function testRetrievePage(
  databaseId: string,
  _properties: GetDatabaseResponse["properties"]
): Promise<void> {
  console.log("\n\n********* Exercising Reading *********\n\n")
  // and read back what we just did
  const queryResponse = await notion.databases.query({
    database_id: databaseId,
  })
  let numOldRows = 0
  for (const page of queryResponse.results) {
    if (!("url" in page)) {
      // Skip partial page objects (these shouldn't be returned anyway.)
      continue
    }

    const createdTime = new Date(page.created_time)
    if (startTime > createdTime) {
      numOldRows++
      return
    }

    console.log(`New page: ${page.id}`)

    for (const [name, property] of Object.entries(page.properties)) {
      const propertyResponse = await notion.pages.properties.retrieve({
        page_id: page.id,
        property_id: property.id,
      })
      console.log(
        ` - ${name} ${property.id} - ${extractValueToString(propertyResponse)}`
      )
    }
  }
  console.log(
    `Skipped printing ${numOldRows} rows that were written before ${startTime}`
  )
}

async function testQueryDatabase(
  databaseId: string,
  properties: GetDatabaseResponse["properties"]
): Promise<void> {
  console.log("\n\n********* Query Database *********\n\n")

  // get a random select or multi-select column from the collection with a random value for it
  const { name: selectColumnName, value: selectColumnValue } =
    findRandomSelectColumnNameAndValue(properties)

  if (!selectColumnName || !selectColumnValue) {
    throw new Error("need a select column to run this part of the example")
  }

  console.log(`Looking for ${selectColumnName}=${selectColumnValue}`)

  // Check we can search by name
  const queryFilterSelectFilterTypeBased = {
    property: selectColumnName,
    select: { equals: selectColumnValue },
  }

  const matchingSelectResults = await notion.databases.query({
    database_id: databaseId,
    filter: queryFilterSelectFilterTypeBased,
  })

  console.log(
    `had ${matchingSelectResults.results.length} matching rows for ${selectColumnName}=${selectColumnValue}`
  )

  // Let's do it again for text

  const textColumn = _.sample(
    Object.values(properties).filter(p => p.type === "rich_text")
  )
  if (!textColumn) {
    throw new Error(
      "Need a rich_text column for this part of the test, could not find one"
    )
  }
  const textColumnId = decodeURIComponent(textColumn.id)
  const letterToFind = faker.lorem.word(1)

  console.log(
    `\n\nLooking for text column with id "${textColumnId}" contains letter "${letterToFind}"`
  )

  const textFilter = {
    property: textColumnId,
    rich_text: { contains: letterToFind },
  }

  // Check we can search by id
  const matchingTextResults = await notion.databases.query({
    database_id: databaseId,
    filter: textFilter,
  })

  console.log(
    `Had ${matchingTextResults.results.length} matching rows in column with ID "${textColumnId}" containing letter "${letterToFind}"`
  )
}

async function main() {
  const databaseIdSui = process.env.SUI_ECOSYSTEM_DATABASE_ID as string

  //____CREATE DATABASE____

  //____Get the databasePropertySchema from the Sui Ecosystem database____ (such that we do not have to define the properties manually)
  const databaseSui = (await notion.databases.retrieve({
    database_id: databaseIdSui,
  })) as DatabaseObjectResponse //retrieve returns a GetDatabaseResponse which is DatabaseObjectResponse | PartialDatabaseObjectResponse
  // typeof cannot be used for user defined types and instanceof is used to check if an object is part of a class

  // console.log(
  //   `__Sui databasePropertySchema from type DatabaseObjectResponse__\n`
  // )
  // console.log(databaseSui.properties)

  let database = databaseSui
  const suiDatabasePropertySchema = database.properties
  let databasePropertySchema =
    suiDatabasePropertySchema as CreateDatabaseParameters["properties"]

  //____Create databasePropertySchema manually____
  const manualDatabasePropertySchema = {
    "not default title column": { title: {} },
    "launch date": { date: {} },
    tags: {
      multi_select: {
        options: [{ name: "tag1" }, { name: "tag2", color: "green" }],
      },
    },
    category: {
      select: { options: [{ name: "cat1" }, { name: "cat2", color: "green" }] },
    },
    email: { email: {} },
    checked: { checkbox: {} },
    twitter: { url: {} },
    amount: { number: {} },
    description: { rich_text: {} },
    contact_nr: { phone_number: {} },
  } as CreateDatabaseParameters["properties"]
  databasePropertySchema = manualDatabasePropertySchema

  //____Create a new database on the base parent page____
  let databaseNew = await testCreateDatabase({
    title: "test-database",
    description: "non default test-database-description",
    properties: databasePropertySchema,
  })

  // Get and refresh the databasePropertySchema from the newly created database, as the ids of the select and multi select properties changed
  databaseNew = (await notion.databases.retrieve({
    database_id: databaseNew.id,
  })) as DatabaseObjectResponse
  database = databaseNew

  console.log(`__databaseNew object__`)
  console.log(database)

  //____UPDATE DATABASE____
  // Get database to update
  let databaseId = database.id
  databaseId = "45608e3d29d14dca93b0453613166bd1"
  database = (await notion.databases.retrieve({
    database_id: databaseId,
  })) as DatabaseObjectResponse

  const columnId = database["properties"]["amount"]["id"]
  const parameters = {
    database_id: databaseId,
    title: [{ text: { content: "new title" } }], // Change the title and description of the database
    description: [{ text: { content: "updated description" } }],
    // archived: true,                                            // Archive the database
    properties: {
      "new property": { rich_text: {} }, // Add a property to the database X
      // "new property": null, // Remove a property from the database X
      // twitter: { rich_text: {} }, // Update a property type of the database X
      // columnId: { name: "amount in USD" }, // Update a property name of the database
    },
  } as UpdateDatabaseParameters

  // Notes on update a property of the database
  // https://developers.notion.com/reference/update-property-schema-object
  // If updating an existing property, then the keys are the names or IDs of the properties as they appear in Notion,
  // and the values are property schema objects. If adding a new property, then the key is
  // the name of the new database property and the value is a property schema object.
  // select and multi_select database property’s options values. An option can be removed, but not updated. (see API docs)

  database = (await notion.databases.update(
    parameters
  )) as DatabaseObjectResponse

  // Update title or description of the database

  // let database = await testUpdateDatabase(database.id, databaseTitle, databaseDescription, databaseArchived, properties)

  await testCreatePage(database.id, database.properties)
  // await testRetrievePage(database.id, databasePropertySchema)
  // await testQueryDatabase(database.id, databasePropertySchema)

  // exit function
  return

  // console.log(`\n\n********* database object *********\n\n
  //   ${await notion.databases.retrieve({
  //     database_id: database.id,
  //   })}`)
}

try {
  main()
} catch (error: unknown) {
  if (isNotionClientError(error)) {
    // error is now strongly typed to NotionClientError
    switch (error.code) {
      case ClientErrorCode.RequestTimeout:
        // ...
        break
      case APIErrorCode.ObjectNotFound:
        // ...
        break
      case APIErrorCode.Unauthorized:
        // ...
        break
      // ...
      default:
        // you could even take advantage of exhaustiveness checking
        // adding a default to our function which tries to assign the shape to never 
        // will raise when every possible case has not been handled.
        // assertNever(error.code), not all cases are handled for the moment so this gives an error as it should
        console.error(error)
    }
  }
}

// q: How to solve property * does not exist on type *?
// a: https://stackoverflow.com/questions/58123398/property-does-not-exist-on-type
